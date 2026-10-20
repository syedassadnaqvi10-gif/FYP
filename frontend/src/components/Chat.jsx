import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { io } from 'socket.io-client';
import { CHAT_API_END_POINT, SOCKET_URL } from '@/utils/constant';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, ArrowLeft, MessageCircle, Trash2, Volume2, VolumeX, MoreVertical } from 'lucide-react';
import Navbar from './shared/Navbar';
import { toast } from 'sonner';

const Chat = () => {
    const { user } = useSelector(store => store.auth);
    const navigate = useNavigate();
    const [conversations, setConversations] = useState([]);
    const [selectedConversation, setSelectedConversation] = useState(null);
    const selectedConversationRef = useRef(null);
    const [messages, setMessages] = useState([]);
    const [messageInput, setMessageInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [socket, setSocket] = useState(null);
    const [messageUpdateTrigger, setMessageUpdateTrigger] = useState(0); // Force re-render trigger
    const [typing, setTyping] = useState(false);
    const [typingUsers, setTypingUsers] = useState({});
    const [authChecked, setAuthChecked] = useState(false);
    const [userStatuses, setUserStatuses] = useState({}); // Track online/offline status
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [unreadCount, setUnreadCount] = useState(0);
    const messagesEndRef = useRef(null);
    const typingTimeoutRef = useRef(null);
    const audioRef = useRef(null);

    // Mark messages as read - defined early so it can be used in socket handlers
    const markAsRead = async (conversationId) => {
        try {
            await axios.put(
                `${CHAT_API_END_POINT}/conversation/${conversationId}/read`,
                {},
                { withCredentials: true }
            );
            fetchConversations(); // Refresh to update unread count
        } catch (error) {
            console.error('Error marking as read:', error);
        }
    };

    // Fetch conversations
    const fetchConversations = async () => {
        try {
            const res = await axios.get(`${CHAT_API_END_POINT}/conversations`, {
                withCredentials: true
            });
            if (res.data.success) {
                setConversations(res.data.conversations);
            }
        } catch (error) {
            console.error('Error fetching conversations:', error);
            // Don't show toast if it's just a 401 (not logged in)
            if (error.response?.status !== 401) {
                toast.error('Failed to load conversations');
            }
        } finally {
            setLoading(false);
        }
    };

    // Check authentication - only redirect if definitely not logged in
    useEffect(() => {
        // Give Redux time to load user state
        const checkAuth = setTimeout(() => {
            // Get token from cookies to double-check
            const getCookie = (name) => {
                const value = `; ${document.cookie}`;
                const parts = value.split(`; ${name}=`);
                if (parts.length === 2) return parts.pop().split(';').shift();
                return null;
            };

            const token = getCookie('token');
            
            // Only redirect if both user state is null AND no token exists
            // This prevents premature redirects while Redux is loading
            if (!user && !token) {
                navigate('/login');
            }
        }, 500); // Increased delay to give Redux more time

        return () => clearTimeout(checkAuth);
    }, [user, navigate]);

    // Initialize socket only if user exists
    useEffect(() => {
        if (!user) return;

        // Get token from cookies
        const getCookie = (name) => {
            const value = `; ${document.cookie}`;
            const parts = value.split(`; ${name}=`);
            if (parts.length === 2) return parts.pop().split(';').shift();
            return null;
        };

        const token = getCookie('token');
        if (!token) return;
        
        let newSocket;
        try {
            newSocket = io(SOCKET_URL, {
                auth: { token },
                transports: ['websocket', 'polling'],
                withCredentials: true,
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000
            });

            newSocket.on('connect', () => {
                console.log('✅ Socket connected successfully. Socket ID:', newSocket.id);
                console.log('✅ User ID:', user?._id);
                
                // Refresh conversations when reconnected
                if (user) {
                    fetchConversations();
                }
                
                // Rejoin conversation room if one is selected
                const currentConv = selectedConversationRef.current;
                if (currentConv && currentConv._id) {
                    const convId = String(currentConv._id);
                    console.log('🔄 Rejoining conversation room after reconnect:', convId);
                    newSocket.emit('join_conversation', convId);
                    // Emit multiple times to ensure it sticks
                    setTimeout(() => {
                        newSocket.emit('join_conversation', convId);
                        console.log('🔄 Re-joined room (retry 1):', convId);
                    }, 200);
                    setTimeout(() => {
                        newSocket.emit('join_conversation', convId);
                        console.log('🔄 Re-joined room (retry 2):', convId);
                    }, 500);
                }
            });

            newSocket.on('disconnect', () => {
                console.log('Socket disconnected');
            });

            newSocket.on('connect_error', (error) => {
                console.error('Socket connection error:', error);
                toast.error('Connection error. Please check your internet connection.');
            });

            newSocket.on('new_message', (messageData) => {
                console.log('🔔🔔🔔 [SOCKET] NEW MESSAGE RECEIVED:', JSON.stringify(messageData, null, 2));
                
                // Get current state using refs (always up-to-date)
                const currentConv = selectedConversationRef.current;
                const currentUserId = user?._id ? String(user._id) : '';
                
                // Extract conversation ID - handle all formats
                let msgConvId = '';
                if (messageData.conversation) {
                    if (typeof messageData.conversation === 'string') {
                        msgConvId = messageData.conversation.trim();
                    } else if (messageData.conversation._id) {
                        msgConvId = String(messageData.conversation._id).trim();
                    } else {
                        msgConvId = String(messageData.conversation).trim();
                    }
                }
                
                // Get current conversation ID
                let currConvId = '';
                if (currentConv && currentConv._id) {
                    currConvId = String(currentConv._id).trim();
                }
                
                // Get sender and recipient IDs
                const msgSenderId = String(messageData.sender?._id || messageData.sender || '');
                const msgRecipientId = String(messageData.recipient?._id || messageData.recipient || '');
                
                // Check if message is for current user
                const isForMe = currentUserId && (msgSenderId === currentUserId || msgRecipientId === currentUserId);
                
                // Check if message is for currently viewed conversation
                const isForCurrentChat = msgConvId && currConvId && msgConvId === currConvId;
                
                console.log('🔍 [SOCKET] Message Analysis:', {
                    msgConvId,
                    currConvId,
                    isForCurrentChat,
                    msgSenderId,
                    msgRecipientId,
                    currentUserId,
                    isForMe,
                    hasCurrentConv: !!currentConv,
                    messageContent: messageData.content?.substring(0, 50)
                });
                
                // If message is for the currently selected conversation, add it IMMEDIATELY
                if (isForCurrentChat && isForMe) {
                    console.log('✅✅✅ [SOCKET] ADDING MESSAGE TO CURRENT CHAT IMMEDIATELY');
                    
                    // CRITICAL: Update messages state with guaranteed new reference
                    setMessages(prevMessages => {
                        console.log('🔄 [SOCKET] State update function called. Previous messages:', prevMessages?.length || 0);
                        
                        // Ensure prevMessages is an array
                        const currentMsgs = Array.isArray(prevMessages) ? prevMessages : [];
                        
                        // Check for duplicate
                        const msgId = String(messageData._id || '');
                        const isDuplicate = currentMsgs.some(m => {
                            const existingId = String(m?._id || '');
                            return existingId === msgId;
                        });
                        
                        if (isDuplicate) {
                            console.log('⚠️ [SOCKET] Duplicate detected, but still forcing update');
                            // Return NEW array to force re-render even for duplicates
                            return [...currentMsgs];
                        }
                        
                        // Remove temp messages with same content
                        const withoutTemps = currentMsgs.filter(m => {
                            const mId = String(m?._id || '');
                            if (mId.startsWith('temp-') && m?.content === messageData?.content) {
                                console.log('🗑️ [SOCKET] Removing temp message');
                                return false;
                            }
                            return true;
                        });
                        
                        // Create properly formatted message
                        const newMsg = {
                            _id: msgId,
                            conversation: msgConvId,
                            sender: {
                                _id: msgSenderId,
                                fullname: messageData.sender?.fullname || '',
                                email: messageData.sender?.email || '',
                                profile: messageData.sender?.profile || {},
                                role: messageData.sender?.role || ''
                            },
                            recipient: {
                                _id: msgRecipientId,
                                fullname: messageData.recipient?.fullname || '',
                                email: messageData.recipient?.email || '',
                                profile: messageData.recipient?.profile || {},
                                role: messageData.recipient?.role || ''
                            },
                            content: String(messageData.content || ''),
                            read: messageData.read || false,
                            deleted: messageData.deleted || false,
                            createdAt: messageData.createdAt ? new Date(messageData.createdAt) : new Date()
                        };
                        
                        // Return NEW array (critical for React to detect change)
                        const updated = [...withoutTemps, newMsg];
                        console.log('➕➕➕ [SOCKET] Message added to state:', {
                            previousCount: withoutTemps.length,
                            newCount: updated.length,
                            messageId: msgId,
                            messageContent: newMsg.content?.substring(0, 30)
                        });
                        
                        return updated;
                    });
                    
                    // Force multiple re-render triggers with delays to ensure React processes them
                    setTimeout(() => {
                        setMessageUpdateTrigger(prev => {
                            const next = prev + 1;
                            console.log('🔄 [SOCKET] Trigger update:', prev, '→', next);
                            return next;
                        });
                    }, 0);
                    
                    setTimeout(() => {
                        setMessageUpdateTrigger(prev => prev + 1);
                    }, 50);
                    
                    // Mark as read if I'm the recipient
                    if (msgRecipientId === currentUserId && currentConv) {
                        setTimeout(() => {
                            markAsRead(currentConv._id);
                        }, 500);
                    }
                    
                    // Auto-scroll to show new message - multiple attempts
                    const scrollAttempts = [100, 250, 500];
                    scrollAttempts.forEach(delay => {
                        setTimeout(() => {
                            if (messagesEndRef.current) {
                                messagesEndRef.current.scrollIntoView({ 
                                    behavior: 'smooth', 
                                    block: 'end',
                                    inline: 'nearest'
                                });
                            }
                        }, delay);
                    });
                } else {
                    console.log('⏸️ [SOCKET] Message not for current chat', {
                        isForCurrentChat,
                        isForMe,
                        msgConvId,
                        currConvId,
                        hasCurrentConv: !!currentConv
                    });
                }
                
                // ALWAYS refresh conversation list (updates unread counts, last message preview)
                fetchConversations();
            });

            newSocket.on('message_received', (message) => {
                console.log('📬 Received message_received event:', message);
                
                // Use ref to get current selected conversation
                const currentConversation = selectedConversationRef.current;
                
                // Convert to string for comparison - handle different formats
                const messageConvId = message.conversation?._id?.toString() || 
                                     message.conversation?._id || 
                                     message.conversation?.toString() || 
                                     message.conversation;
                const selectedConvId = currentConversation?._id?.toString() || currentConversation?._id;
                const isCurrentConversation = selectedConvId && messageConvId && 
                    String(messageConvId) === String(selectedConvId);
                
                // If message is for current conversation, add it to messages
                if (isCurrentConversation) {
                    console.log('✅ message_received: Message is for current conversation, adding');
                    setMessages(prev => {
                        // Always create a new array
                        const currentMessages = [...prev];
                        
                        // Check if message already exists
                        const exists = currentMessages.some(m => {
                            const existingId = m._id?.toString();
                            const newId = message._id?.toString();
                            return existingId === newId;
                        });
                        
                        if (!exists) {
                            console.log('➕ Adding message from message_received event');
                            return [...currentMessages, message];
                        }
                        // Return new array even if exists to trigger re-render
                        return [...currentMessages];
                    });
                }
                
                // Always update conversation list when receiving a message
                fetchConversations();
                fetchUnreadCount();
            });

            // Handle user status changes (online/offline)
            newSocket.on('user_status_change', (data) => {
                setUserStatuses(prev => ({
                    ...prev,
                    [data.userId]: data.status
                }));
            });

            // Handle new message notifications with sound
            newSocket.on('new_message_notification', (data) => {
                const currentConversation = selectedConversationRef.current;
                const senderId = data.message.sender?._id || data.message.sender;
                const currentUserId = user?._id;
                
                // Play sound if enabled and message is not from current user
                if (soundEnabled && currentUserId && String(senderId) !== String(currentUserId)) {
                    playNotificationSound();
                }
                // Show browser notification if permission granted
                showBrowserNotification(data.message);
                
                // Also update messages if it's for current conversation
                const messageConvId = data.message.conversation?._id || data.message.conversation || data.conversationId;
                const selectedConvId = currentConversation?._id;
                if (selectedConvId && messageConvId && String(messageConvId) === String(selectedConvId)) {
                    setMessages(prev => {
                        if (prev.some(m => m._id === data.message._id)) {
                            return prev;
                        }
                        return [...prev, data.message];
                    });
                }
            });

            // Handle message deletion
            newSocket.on('message_deleted', (data) => {
                if (selectedConversation && data.conversationId === selectedConversation._id) {
                    setMessages(prev => prev.filter(msg => msg._id !== data.messageId));
                }
                fetchConversations();
            });

            newSocket.on('user_typing', (data) => {
                if (data.conversationId === selectedConversation?._id) {
                    setTypingUsers(prev => ({
                        ...prev,
                        [data.userId]: data.isTyping
                    }));
                    setTimeout(() => {
                        setTypingUsers(prev => {
                            const updated = { ...prev };
                            delete updated[data.userId];
                            return updated;
                        });
                    }, 3000);
                }
            });

            setSocket(newSocket);
        } catch (error) {
            console.error('Error initializing socket:', error);
            // Don't redirect on socket initialization errors
        }

        return () => {
            if (newSocket) {
                newSocket.close();
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    // Play notification sound
    const playNotificationSound = () => {
        if (audioRef.current) {
            audioRef.current.play().catch(err => console.log('Sound play failed:', err));
        }
    };

    // Show browser notification
    const showBrowserNotification = (message) => {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`New message from ${message.sender.fullname}`, {
                body: message.content,
                icon: message.sender.profile?.profilePhoto || '/default-avatar.png',
                tag: `message-${message._id}`
            });
        }
    };

    // Request notification permission
    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);

    // Fetch conversations on mount and when user changes
    useEffect(() => {
        if (user) {
            fetchConversations();
            fetchUnreadCount();
        }
    }, [user]);

    // Fetch unread count periodically
    const fetchUnreadCount = async () => {
        try {
            const res = await axios.get(`${CHAT_API_END_POINT}/unread-count`, {
                withCredentials: true
            });
            if (res.data.success) {
                setUnreadCount(res.data.unreadCount);
            }
        } catch (error) {
            console.error('Error fetching unread count:', error);
        }
    };

    // Update unread count periodically
    useEffect(() => {
        if (user) {
            const interval = setInterval(fetchUnreadCount, 30000); // Every 30 seconds
            return () => clearInterval(interval);
        }
    }, [user]);

    // Start conversation with a specific user
    const startConversationWithUser = async (recipientId) => {
        try {
            const res = await axios.get(
                `${CHAT_API_END_POINT}/conversation/${recipientId}`,
                { withCredentials: true }
            );
            if (res.data.success) {
                const conversation = res.data.conversation;
                // Update conversations list
                await fetchConversations();
                // Select the conversation
                handleSelectConversation(conversation);
                // Clear URL parameter
                window.history.replaceState({}, '', '/chat');
            }
        } catch (error) {
            console.error('Error starting conversation:', error);
            toast.error('Failed to start conversation');
        }
    };

    // Fetch a specific conversation by ID
    const fetchConversationById = async (conversationId) => {
        try {
            // Fetch all conversations to find the one we need
            const res = await axios.get(`${CHAT_API_END_POINT}/conversations`, {
                withCredentials: true
            });
            if (res.data && res.data.success && res.data.conversations) {
                const conversationsList = res.data.conversations;
                const conversation = conversationsList.find(c => c._id === conversationId);
                if (conversation) {
                    setConversations(conversationsList);
                    handleSelectConversation(conversation);
                    window.history.replaceState({}, '', '/chat');
                } else {
                    toast.error('Conversation not found');
                    window.history.replaceState({}, '', '/chat');
                }
            } else {
                toast.error('Failed to load conversation');
            }
        } catch (error) {
            console.error('Error fetching conversation:', error);
            toast.error(error.response?.data?.message || 'Failed to load conversation');
        }
    };

    // Handle starting conversation from URL parameters
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const conversationId = urlParams.get('conversationId');
        const recipientId = urlParams.get('userId');
        
        if (conversationId && user) {
            // Wait for conversations to load first
            if (conversations.length > 0) {
                // Try to find conversation in existing list
                const conversation = conversations.find(c => c._id === conversationId);
                if (conversation) {
                    handleSelectConversation(conversation);
                    window.history.replaceState({}, '', '/chat');
                } else {
                    // Conversation not in list, fetch it directly
                    fetchConversationById(conversationId);
                }
            } else {
                // Wait a bit for conversations to load, then check again
                const timer = setTimeout(() => {
                    const conversation = conversations.find(c => c._id === conversationId);
                    if (conversation) {
                        handleSelectConversation(conversation);
                        window.history.replaceState({}, '', '/chat');
                    } else {
                        fetchConversationById(conversationId);
                    }
                }, 1000);
                return () => clearTimeout(timer);
            }
        } else if (recipientId && user && socket && conversations.length >= 0) {
            startConversationWithUser(recipientId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, socket, conversations]);

    // Fetch messages for selected conversation
    const fetchMessages = async (conversationId) => {
        try {
            console.log('📥 Fetching messages for conversation:', conversationId);
            const res = await axios.get(
                `${CHAT_API_END_POINT}/conversation/${conversationId}/messages`,
                { withCredentials: true }
            );
            if (res.data.success) {
                const fetchedMessages = res.data.messages || [];
                console.log('📥 Fetched', fetchedMessages.length, 'messages');
                
                // Update messages state
                setMessages(fetchedMessages);
                
                // Force re-render trigger
                setMessageUpdateTrigger(prev => prev + 1);
                
                // Mark as read
                markAsRead(conversationId);
                
                // CRITICAL: Join conversation room to receive real-time updates
                const normalizedConvId = String(conversationId);
                
                if (socket) {
                    if (socket.connected) {
                        console.log('🔌 Joining conversation room (fetchMessages):', normalizedConvId);
                        socket.emit('join_conversation', normalizedConvId);
                        
                        // Emit multiple times to ensure we're in the room
                        setTimeout(() => {
                            if (socket.connected) {
                                socket.emit('join_conversation', normalizedConvId);
                                console.log('🔌 Re-joined room (retry 1):', normalizedConvId);
                            }
                        }, 100);
                        
                        setTimeout(() => {
                            if (socket.connected) {
                                socket.emit('join_conversation', normalizedConvId);
                                console.log('🔌 Re-joined room (retry 2):', normalizedConvId);
                            }
                        }, 300);
                    } else {
                        console.log('⏳ Socket not connected, waiting...');
                        const connectHandler = () => {
                            console.log('🔌 Socket connected, joining room:', normalizedConvId);
                            socket.emit('join_conversation', normalizedConvId);
                            socket.emit('join_conversation', normalizedConvId); // Emit twice
                            socket.off('connect', connectHandler);
                        };
                        socket.on('connect', connectHandler);
                        if (!socket.connecting && !socket.active) {
                            socket.connect();
                        }
                    }
                } else {
                    console.error('❌ Socket is null, cannot join room');
                }
                
                // Auto-scroll after messages are loaded
                setTimeout(() => {
                    if (messagesEndRef.current) {
                        messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
                    }
                }, 200);
            }
        } catch (error) {
            console.error('Error fetching messages:', error);
            toast.error('Failed to load messages');
        }
    };

    // Handle conversation selection
    const handleSelectConversation = (conversation) => {
        console.log('🎯 Selecting conversation:', conversation._id);
        
        // Leave previous conversation room
        if (selectedConversation && socket && socket.connected) {
            const prevConvId = String(selectedConversation._id || '');
            socket.emit('leave_conversation', prevConvId);
        }

        // Update state and ref IMMEDIATELY
        setSelectedConversation(conversation);
        selectedConversationRef.current = conversation;
        
        // Fetch messages for this conversation
        fetchMessages(conversation._id);
        
        // CRITICAL: Join conversation room multiple times to ensure we're in it
        if (socket) {
            const conversationId = String(conversation._id);
            
            if (socket.connected) {
                console.log('🔌 Joining conversation room (selected):', conversationId);
                socket.emit('join_conversation', conversationId);
                
                // Emit again after short delay to ensure it sticks
                setTimeout(() => {
                    if (socket && socket.connected) {
                        socket.emit('join_conversation', conversationId);
                        console.log('🔌 Re-joined conversation room:', conversationId);
                    }
                }, 200);
            } else {
                console.log('⏳ Socket not connected, waiting...');
                const connectHandler = () => {
                    console.log('🔌 Socket connected, joining conversation room:', conversationId);
                    socket.emit('join_conversation', conversationId);
                    socket.emit('join_conversation', conversationId); // Emit twice
                    socket.off('connect', connectHandler);
                };
                socket.on('connect', connectHandler);
                
                if (!socket.connecting && !socket.active) {
                    socket.connect();
                }
            }
        } else {
            console.error('❌ Socket is null when selecting conversation');
        }
    };

    // Send message
    const sendMessage = async (e) => {
        // Prevent default form submission if called from button
        if (e) {
            e.preventDefault();
        }

        const content = messageInput.trim();
        
        // Basic validation
        if (!content) {
            toast.error('Please enter a message');
            return;
        }

        if (!selectedConversation) {
            toast.error('Please select a conversation');
            return;
        }

        if (!user || !user._id) {
            toast.error('User not authenticated');
            return;
        }

        // Get recipient using the helper function
        const otherParticipant = getOtherParticipant(selectedConversation);
        if (!otherParticipant || !otherParticipant._id) {
            console.error('Other participant not found:', selectedConversation);
            toast.error('Unable to identify recipient. Please refresh the page.');
            return;
        }

        const messageData = {
            conversationId: selectedConversation._id,
            recipientId: otherParticipant._id,
            content: content
        };

        // Store message content before clearing input
        const messageContent = content;
        
        // Clear input immediately for better UX
        setMessageInput('');
        
        // Optimistically add message to UI
        const tempMessage = {
            _id: `temp-${Date.now()}`,
            conversation: selectedConversation._id,
            sender: { _id: user._id, fullname: user.fullname || user.email, profile: user.profile },
            recipient: otherParticipant,
            content: messageContent,
            createdAt: new Date(),
            read: false,
            deleted: false
        };
        setMessages(prev => [...prev, tempMessage]);
        
        // Stop typing indicator
        setTyping(false);
        if (socket && socket.connected) {
            socket.emit('typing', {
                conversationId: selectedConversation._id,
                isTyping: false
            });
        }

        try {
            // Try sending via REST API first (more reliable)
            try {
                const apiRes = await axios.post(
                    `${CHAT_API_END_POINT}/message`,
                    messageData,
                    { withCredentials: true }
                );
                
                if (apiRes.data.success && apiRes.data.message) {
                    // Remove temp message and add real message
                    setMessages(prev => {
                        const filtered = prev.filter(msg => msg._id !== tempMessage._id);
                        // Add real message if not already present
                        if (!filtered.some(msg => msg._id === apiRes.data.message._id)) {
                            return [...filtered, apiRes.data.message];
                        }
                        return filtered;
                    });
                }
            } catch (apiError) {
                console.error('API send error:', apiError);
                // Continue with socket send as fallback
            }

            // Also send via socket if available
            if (socket) {
                if (!socket.connected) {
                    // Try to reconnect
                    socket.connect();
                }
                
                if (socket.connected) {
                    // Ensure we're in the conversation room
                    socket.emit('join_conversation', selectedConversation._id);
                    // Send via socket
                    socket.emit('send_message', messageData);
                }
            }
        } catch (error) {
            console.error('Error sending message:', error);
            // Restore input on error
            setMessageInput(messageContent);
            // Remove temp message
            setMessages(prev => prev.filter(msg => msg._id !== tempMessage._id));
            toast.error('Failed to send message. Please try again.');
        }
    };


    // Handle typing indicator
    const handleTyping = (isTyping) => {
        if (!selectedConversation || !socket) return;

        socket.emit('typing', {
            conversationId: selectedConversation._id,
            isTyping
        });

        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        if (isTyping) {
            typingTimeoutRef.current = setTimeout(() => {
                socket.emit('typing', {
                    conversationId: selectedConversation._id,
                    isTyping: false
                });
                setTyping(false);
            }, 1000);
        }
    };

    // Delete a message
    const handleDeleteMessage = async (messageId) => {
        if (!window.confirm('Are you sure you want to delete this message?')) {
            return;
        }

        try {
            const res = await axios.delete(
                `${CHAT_API_END_POINT}/message/${messageId}`,
                { withCredentials: true }
            );
            if (res.data.success) {
                // Remove message from UI
                setMessages(prev => prev.filter(msg => msg._id !== messageId));
                // Emit deletion via socket
                if (socket && selectedConversation) {
                    socket.emit('delete_message', {
                        messageId,
                        conversationId: selectedConversation._id
                    });
                }
                toast.success('Message deleted');
            }
        } catch (error) {
            console.error('Error deleting message:', error);
            toast.error(error.response?.data?.message || 'Failed to delete message');
        }
    };

    // Remove duplicate - handled below
    
    // CRITICAL: Force re-render and scroll when messages change
    useEffect(() => {
        console.log('🔄 [EFFECT] Messages updated. Count:', messages.length, 'Trigger:', messageUpdateTrigger, 'Selected Conv:', selectedConversation?._id);
        
        // Force scroll to bottom when new messages arrive
        if (messages.length > 0 && selectedConversation) {
            // Use multiple timeouts to ensure scroll happens
            const scrollToBottom = () => {
                if (messagesEndRef.current) {
                    try {
                        messagesEndRef.current.scrollIntoView({ 
                            behavior: 'smooth', 
                            block: 'end',
                            inline: 'nearest'
                        });
                    } catch (e) {
                        console.log('Scroll error:', e);
                    }
                }
            };
            
            // Scroll immediately
            scrollToBottom();
            
            // Scroll again after delays (in case DOM hasn't updated)
            setTimeout(scrollToBottom, 100);
            setTimeout(scrollToBottom, 300);
            setTimeout(scrollToBottom, 600);
        }
    }, [messages, messageUpdateTrigger, selectedConversation]);
    
    // Also update ref when selectedConversation changes
    useEffect(() => {
        selectedConversationRef.current = selectedConversation;
        console.log('📌 [EFFECT] Conversation ref updated:', selectedConversation?._id);
        
        // When conversation changes, ensure we're in the room
        if (selectedConversation && socket && socket.connected) {
            const convId = String(selectedConversation._id);
            console.log('🔌 [EFFECT] Ensuring in room for conversation:', convId);
            socket.emit('join_conversation', convId);
            setTimeout(() => socket.emit('join_conversation', convId), 200);
            setTimeout(() => socket.emit('join_conversation', convId), 500);
        }
    }, [selectedConversation, socket]);
    
    // Fallback: Poll for new messages if socket might not be working
    useEffect(() => {
        if (!selectedConversation || !socket) return;
        
        // Only poll if socket is connected and we have an active conversation
        const pollInterval = setInterval(() => {
            if (socket.connected && selectedConversation) {
                // Silently check for new messages every 5 seconds as fallback
                fetchMessages(selectedConversation._id);
            }
        }, 5000); // Poll every 5 seconds
        
        return () => clearInterval(pollInterval);
    }, [selectedConversation, socket]);

    // Get other participant from conversation
    const getOtherParticipant = (conversation) => {
        return conversation.otherParticipant || conversation.participants?.find(
            p => p._id !== user?._id
        );
    };

    // Get initials for avatar fallback
    const getInitials = (name) => {
        return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
    };

    // Format time
    const formatTime = (date) => {
        const messageDate = new Date(date);
        const now = new Date();
        const diff = now - messageDate;
        const minutes = Math.floor(diff / 60000);
        
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
        return messageDate.toLocaleDateString();
    };

    // Check authentication status
    useEffect(() => {
        // Check if user is loaded or token exists
        const getCookie = (name) => {
            const value = `; ${document.cookie}`;
            const parts = value.split(`; ${name}=`);
            if (parts.length === 2) return parts.pop().split(';').shift();
            return null;
        };
        
        const token = getCookie('token');
        if (user || token) {
            setAuthChecked(true);
        } else {
            // Only redirect if we're sure there's no user after a delay
            const timer = setTimeout(() => {
                if (!user && !token) {
                    navigate('/login');
                } else {
                    setAuthChecked(true);
                }
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [user, navigate]);

    if (!authChecked && !user) {
        return (
            <div className="min-h-screen bg-gray-50">
                <Navbar />
                <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-center">
                    <div className="text-center">
                        <p className="text-gray-500">Loading messages...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Hidden audio element for notification sounds */}
            <audio ref={audioRef} preload="auto">
                <source src="/notification-sound.mp3" type="audio/mpeg" />
            </audio>
            <Navbar />
            <div className="max-w-7xl mx-auto px-2 md:px-4 py-4 md:py-6">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 h-[calc(100vh-160px)] md:h-[calc(100vh-180px)] flex flex-col md:flex-row">
                    {/* Conversations List */}
                    <div className={`w-full ${selectedConversation ? 'hidden md:flex' : 'flex'} md:w-1/3 border-r border-gray-200 flex flex-col`}>
                        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                            <h2 className="text-xl font-semibold">Messages</h2>
                            <div className="flex items-center gap-2">
                                {unreadCount > 0 && (
                                    <span className="bg-blue-600 text-white text-xs rounded-full px-2 py-1">
                                        {unreadCount}
                                    </span>
                                )}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSoundEnabled(!soundEnabled)}
                                    className="h-8 w-8 p-0"
                                    title={soundEnabled ? 'Mute notifications' : 'Enable notifications'}
                                >
                                    {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                                </Button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {loading ? (
                                <div className="p-4 text-center text-gray-500">Loading conversations...</div>
                            ) : conversations.length === 0 ? (
                                <div className="p-4 text-center text-gray-500">
                                    <MessageCircle className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                                    <p>No conversations yet</p>
                                </div>
                            ) : (
                                conversations.map((conversation) => {
                                    const otherParticipant = getOtherParticipant(conversation);
                                    const unreadCount = conversation.unreadCount || 0;
                                    
                                    return (
                                        <div
                                            key={conversation._id}
                                            onClick={() => handleSelectConversation(conversation)}
                                            className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                                                selectedConversation?._id === conversation._id ? 'bg-blue-50' : ''
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-12 w-12">
                                                    <AvatarImage src={otherParticipant?.profile?.profilePhoto} />
                                                    <AvatarFallback>{getInitials(otherParticipant?.fullname)}</AvatarFallback>
                                                </Avatar>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                            <h3 className="font-medium text-sm truncate">
                                                                {otherParticipant?.fullname || 'Unknown User'}
                                                            </h3>
                                                            {/* Online/Offline Status Indicator */}
                                                            <div className={`h-2 w-2 rounded-full flex-shrink-0 ${
                                                                userStatuses[otherParticipant?._id] === 'online' 
                                                                    ? 'bg-green-500' 
                                                                    : 'bg-gray-400'
                                                            }`} title={
                                                                userStatuses[otherParticipant?._id] === 'online' 
                                                                    ? 'Online' 
                                                                    : 'Offline'
                                                            } />
                                                        </div>
                                                        {conversation.unreadCount > 0 && (
                                                            <span className="bg-blue-600 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center flex-shrink-0">
                                                                {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {/* Job Context Badge */}
                                                    {conversation.job && (
                                                        <p className="text-xs text-blue-600 font-medium mt-1">
                                                            📋 {conversation.job.title}
                                                            {conversation.job.company && ` • ${conversation.job.company.name}`}
                                                        </p>
                                                    )}
                                                    <p className="text-xs text-gray-500 truncate mt-1">
                                                        {conversation.lastMessage?.content || 'No messages yet'}
                                                    </p>
                                                    {conversation.lastMessageAt && (
                                                        <p className="text-xs text-gray-400 mt-1">
                                                            {formatTime(conversation.lastMessageAt)}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Messages Area - Desktop */}
                    <div className="hidden md:flex flex-1 flex-col min-w-0">
                        {selectedConversation ? (
                            <>
                                {/* Chat Header */}
                                <div className="p-4 border-b border-gray-200">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="relative">
                                            <Avatar className="h-10 w-10">
                                                <AvatarImage src={getOtherParticipant(selectedConversation)?.profile?.profilePhoto} />
                                                <AvatarFallback>
                                                    {getInitials(getOtherParticipant(selectedConversation)?.fullname)}
                                                </AvatarFallback>
                                            </Avatar>
                                            {/* Online/Offline Status Badge */}
                                            <div className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${
                                                userStatuses[getOtherParticipant(selectedConversation)?._id] === 'online' 
                                                    ? 'bg-green-500' 
                                                    : 'bg-gray-400'
                                            }`} />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-medium flex items-center gap-2">
                                                {getOtherParticipant(selectedConversation)?.fullname || 'Unknown User'}
                                            </h3>
                                            <p className="text-xs text-gray-500 capitalize">
                                                {userStatuses[getOtherParticipant(selectedConversation)?._id] === 'online' 
                                                    ? 'Active' 
                                                    : 'Offline'} • {
                                                    getOtherParticipant(selectedConversation)?.role === 'recruiter' 
                                                        ? 'Recruiter' 
                                                        : 'Applicant'
                                                }
                                            </p>
                                        </div>
                                    </div>
                                    {/* Job Context Banner */}
                                    {selectedConversation.job && (
                                        <div className="mt-2 p-3 bg-blue-50 rounded-md border border-blue-100">
                                            <p className="text-sm font-medium text-blue-900">
                                                📋 Job: {selectedConversation.job.title}
                                            </p>
                                            {selectedConversation.job.company && (
                                                <p className="text-xs text-blue-700 mt-1">
                                                    Company: {selectedConversation.job.company.name || selectedConversation.job.company}
                                                </p>
                                            )}
                                            {selectedConversation.application?.status && (
                                                <p className="text-xs text-blue-600 mt-1">
                                                    Application Status: <span className="font-medium capitalize">{selectedConversation.application.status}</span>
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Messages */}
                                <div className="flex-1 overflow-y-auto p-4 space-y-4" key={`messages-desktop-${messageUpdateTrigger}-${messages.length}-${selectedConversation?._id || 'none'}`}>
                                    {messages && messages.length > 0 ? messages.map((message, index) => {
                                        const isOwn = String(message.sender?._id || message.sender) === String(user?._id);
                                        const isDeleted = message.deleted;
                                        return (
                                            <div
                                                key={`msg-${message._id}-${index}-${message.createdAt || Date.now()}`}
                                                className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group`}
                                            >
                                                <div className={`max-w-[75%] md:max-w-xs lg:max-w-md px-4 py-2 rounded-lg relative break-words ${
                                                    isDeleted 
                                                        ? 'opacity-60 italic bg-gray-100 text-gray-500'
                                                        : isOwn
                                                            ? 'bg-blue-600 text-white'
                                                            : 'bg-gray-200 text-gray-900'
                                                }`}>
                                                    {isDeleted ? (
                                                        <p className="text-sm">This message was deleted</p>
                                                    ) : (
                                                        <p className="text-sm">{message.content}</p>
                                                    )}
                                                    <div className="flex items-center justify-between mt-1">
                                                        <p className={`text-xs ${
                                                            isOwn ? 'text-blue-100' : 'text-gray-500'
                                                        }`}>
                                                            {formatTime(message.createdAt)}
                                                        </p>
                                                        {isOwn && !isDeleted && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => handleDeleteMessage(message._id)}
                                                                className={`h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity ${
                                                                    isOwn ? 'text-blue-100 hover:text-white' : ''
                                                                }`}
                                                                title="Delete message"
                                                            >
                                                                <Trash2 className="h-3 w-3" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }) : (
                                        <div className="flex items-center justify-center h-full text-gray-500">
                                            <p className="text-sm">No messages yet. Start the conversation!</p>
                                        </div>
                                    )}
                                    {Object.keys(typingUsers).length > 0 && (
                                        <div className="flex justify-start">
                                            <div className="bg-gray-200 px-4 py-2 rounded-lg">
                                                <p className="text-sm text-gray-500">Typing...</p>
                                            </div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* Message Input */}
                                <div className="p-4 border-t border-gray-200">
                                    <div className="flex gap-2">
                                        <Input
                                            value={messageInput}
                                            onChange={(e) => {
                                                setMessageInput(e.target.value);
                                                handleTyping(true);
                                            }}
                                            onKeyPress={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    sendMessage();
                                                }
                                            }}
                                            placeholder="Type a message..."
                                            className="flex-1"
                                        />
                                        <Button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                sendMessage(e);
                                            }}
                                            disabled={!messageInput.trim()}
                                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                            type="button"
                                        >
                                            <Send className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-gray-500">
                                <div className="text-center">
                                    <MessageCircle className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                                    <p>Select a conversation to start messaging</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Mobile View - Show messages when conversation selected */}
                    <div className={`${selectedConversation ? 'flex' : 'hidden'} md:hidden flex-1 flex flex-col`}>
                        {selectedConversation && (
                            <>
                                <div className="p-3 border-b border-gray-200">
                                    <div className="flex items-center gap-3 mb-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                if (socket && selectedConversation) {
                                                    socket.emit('leave_conversation', selectedConversation._id);
                                                }
                                                setSelectedConversation(null);
                                                setMessages([]);
                                            }}
                                        >
                                            <ArrowLeft className="h-4 w-4" />
                                        </Button>
                                        <div className="relative">
                                            <Avatar className="h-8 w-8">
                                                <AvatarImage src={getOtherParticipant(selectedConversation)?.profile?.profilePhoto} />
                                                <AvatarFallback>
                                                    {getInitials(getOtherParticipant(selectedConversation)?.fullname)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-white ${
                                                userStatuses[getOtherParticipant(selectedConversation)?._id] === 'online' 
                                                    ? 'bg-green-500' 
                                                    : 'bg-gray-400'
                                            }`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-medium text-sm truncate">
                                                {getOtherParticipant(selectedConversation)?.fullname || 'Unknown User'}
                                            </h3>
                                            <p className="text-xs text-gray-500 capitalize">
                                                {userStatuses[getOtherParticipant(selectedConversation)?._id] === 'online' 
                                                    ? 'Active' 
                                                    : 'Offline'}
                                            </p>
                                        </div>
                                    </div>
                                    {/* Job Context Banner - Mobile */}
                                    {selectedConversation.job && (
                                        <div className="mt-2 p-2 bg-blue-50 rounded-md border border-blue-100">
                                            <p className="text-xs font-medium text-blue-900 truncate">
                                                📋 {selectedConversation.job.title}
                                            </p>
                                            {selectedConversation.job.company && (
                                                <p className="text-xs text-blue-700 truncate">
                                                    {selectedConversation.job.company.name || selectedConversation.job.company}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div 
                                    className="flex-1 overflow-y-auto p-3 space-y-3" 
                                    key={`messages-mobile-${messageUpdateTrigger}-${messages.length}-${selectedConversation?._id || 'none'}-${Date.now()}`}
                                >
                                    {messages && messages.length > 0 ? messages.map((message, index) => {
                                        const isOwn = String(message.sender?._id || message.sender) === String(user?._id);
                                        const isDeleted = message.deleted;
                                        return (
                                            <div
                                                key={`msg-${message._id}-${index}-${message.createdAt || Date.now()}`}
                                                className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group`}
                                            >
                                                <div className={`max-w-[75%] px-3 py-2 rounded-lg ${
                                                    isDeleted 
                                                        ? 'opacity-60 italic bg-gray-100 text-gray-500'
                                                        : isOwn
                                                            ? 'bg-blue-600 text-white'
                                                            : 'bg-gray-200 text-gray-900'
                                                }`}>
                                                    {isDeleted ? (
                                                        <p className="text-xs">This message was deleted</p>
                                                    ) : (
                                                        <p className="text-sm break-words">{message.content}</p>
                                                    )}
                                                    <p className={`text-xs mt-1 ${
                                                        isOwn ? 'text-blue-100' : 'text-gray-500'
                                                    }`}>
                                                        {formatTime(message.createdAt)}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    }) : (
                                        <div className="flex items-center justify-center h-full text-gray-500">
                                            <p className="text-xs">No messages yet.</p>
                                        </div>
                                    )}
                                    {Object.keys(typingUsers).length > 0 && (
                                        <div className="flex justify-start">
                                            <div className="bg-gray-200 px-3 py-2 rounded-lg">
                                                <p className="text-xs text-gray-500">Typing...</p>
                                            </div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>
                                <div className="p-3 border-t border-gray-200">
                                    <div className="flex gap-2">
                                        <Input
                                            value={messageInput}
                                            onChange={(e) => {
                                                setMessageInput(e.target.value);
                                                handleTyping(true);
                                            }}
                                            onKeyPress={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    sendMessage(e);
                                                }
                                            }}
                                            placeholder="Type a message..."
                                            className="flex-1 text-sm"
                                        />
                                        <Button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                sendMessage(e);
                                            }}
                                            disabled={!messageInput.trim()}
                                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                                            size="sm"
                                            type="button"
                                        >
                                            <Send className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Chat;

