import { Conversation } from '../models/conversation.model.js';
import { Message } from '../models/message.model.js';
import { User } from '../models/user.model.js';
import { Application } from '../models/application.model.js';
import { Job } from '../models/job.model.js';

// Get or create a conversation between two users
export const getOrCreateConversation = async (req, res) => {
    try {
        const { recipientId } = req.params;
        const senderId = req.id;

        if (senderId.toString() === recipientId) {
            return res.status(400).json({
                success: false,
                message: "Cannot create conversation with yourself"
            });
        }

        // Check if recipient exists
        const recipient = await User.findById(recipientId);
        if (!recipient) {
            return res.status(404).json({
                success: false,
                message: "Recipient not found"
            });
        }

        // Find existing conversation
        let conversation = await Conversation.findOne({
            participants: { $all: [senderId, recipientId] }
        }).populate('participants', 'fullname email profile.profilePhoto role');

        // Create new conversation if it doesn't exist
        if (!conversation) {
            conversation = await Conversation.create({
                participants: [senderId, recipientId]
            });
            conversation = await Conversation.findById(conversation._id)
                .populate('participants', 'fullname email profile.profilePhoto role');
        }

        res.status(200).json({
            success: true,
            conversation
        });
    } catch (error) {
        console.error('Error in getOrCreateConversation:', error);
        res.status(500).json({
            success: false,
            message: error.message || "Failed to get or create conversation"
        });
    }
};

// Get all conversations for the current user
export const getConversations = async (req, res) => {
    try {
        const userId = req.id;

        const conversations = await Conversation.find({
            participants: userId
        })
            .populate('participants', 'fullname email profile.profilePhoto role')
            .populate({
                path: 'job',
                select: 'title company',
                populate: {
                    path: 'company',
                    select: 'name'
                }
            })
            .populate('application', 'status')
            .populate('lastMessage')
            .sort({ lastMessageAt: -1, updatedAt: -1 });

        // Get unread count for each conversation
        const conversationsWithUnread = await Promise.all(
            conversations.map(async (conv) => {
                const otherParticipant = conv.participants.find(
                    p => p._id.toString() !== userId.toString()
                );

                // 30-day visibility limit
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                const unreadCount = await Message.countDocuments({
                    conversation: conv._id,
                    recipient: userId,
                    read: false,
                    deleted: false,
                    createdAt: { $gte: thirtyDaysAgo }
                });

                return {
                    ...conv.toObject(),
                    otherParticipant,
                    unreadCount
                };
            })
        );

        res.status(200).json({
            success: true,
            conversations: conversationsWithUnread
        });
    } catch (error) {
        console.error('Error in getConversations:', error);
        res.status(500).json({
            success: false,
            message: error.message || "Failed to get conversations"
        });
    }
};

// Get messages for a conversation
export const getMessages = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.id;

        // Verify user is part of the conversation
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: "Conversation not found"
            });
        }

        const isParticipant = conversation.participants.some(
            p => p.toString() === userId.toString()
        );
        if (!isParticipant) {
            return res.status(403).json({
                success: false,
                message: "Access denied"
            });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        // 30-day visibility limit: only show messages from the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Find messages: not deleted OR deleted by the current user (for audit trail)
        const messages = await Message.find({
            conversation: conversationId,
            createdAt: { $gte: thirtyDaysAgo },
            $or: [
                { deleted: false },
                { deleted: true, deletedBy: userId } // Show deleted messages if user deleted them (audit)
            ]
        })
            .populate('sender', 'fullname email profile.profilePhoto role')
            .populate('recipient', 'fullname email profile.profilePhoto role')
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(skip);

        const totalMessages = await Message.countDocuments({
            conversation: conversationId,
            createdAt: { $gte: thirtyDaysAgo },
            $or: [
                { deleted: false },
                { deleted: true, deletedBy: userId }
            ]
        });

        res.status(200).json({
            success: true,
            messages: messages.reverse(), // Reverse to show oldest first
            pagination: {
                page,
                limit,
                total: totalMessages,
                pages: Math.ceil(totalMessages / limit)
            }
        });
    } catch (error) {
        console.error('Error in getMessages:', error);
        res.status(500).json({
            success: false,
            message: error.message || "Failed to get messages"
        });
    }
};

// Send a message
export const sendMessage = async (req, res) => {
    try {
        const { conversationId, recipientId, content } = req.body;
        const senderId = req.id;

        if (!content || !content.trim()) {
            return res.status(400).json({
                success: false,
                message: "Message content is required"
            });
        }

        let conversation;

        // If conversationId is provided, use it; otherwise create/find by recipient
        if (conversationId) {
            conversation = await Conversation.findById(conversationId);
            if (!conversation) {
                return res.status(404).json({
                    success: false,
                    message: "Conversation not found"
                });
            }
            if (!conversation.participants.includes(senderId)) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied"
                });
            }
        } else if (recipientId) {
            // Find or create conversation
            conversation = await Conversation.findOne({
                participants: { $all: [senderId, recipientId] }
            });

            if (!conversation) {
                conversation = await Conversation.create({
                    participants: [senderId, recipientId]
                });
            }
            
            // Refresh to get populated participants
            conversation = await Conversation.findById(conversation._id);
        } else {
            return res.status(400).json({
                success: false,
                message: "Either conversationId or recipientId is required"
            });
        }

        // Get recipient from conversation (ensure it's a string/ObjectId comparison)
        const recipientIdToUse = recipientId || conversation.participants.find(
            p => p.toString() !== senderId.toString()
        )?.toString();
        
        if (!recipientIdToUse) {
            return res.status(400).json({
                success: false,
                message: "Recipient not found in conversation"
            });
        }

        // Create message
        const message = await Message.create({
            conversation: conversation._id,
            sender: senderId,
            recipient: recipientIdToUse,
            content: content.trim()
        });

        // Populate message
        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'fullname email profile.profilePhoto role')
            .populate('recipient', 'fullname email profile.profilePhoto role');

        // Update conversation's last message
        conversation.lastMessage = message._id;
        conversation.lastMessageAt = new Date();
        await conversation.save();

        res.status(201).json({
            success: true,
            message: populatedMessage
        });
    } catch (error) {
        console.error('Error in sendMessage:', error);
        res.status(500).json({
            success: false,
            message: error.message || "Failed to send message"
        });
    }
};

// Mark messages as read
export const markAsRead = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.id;

        // Verify user is part of the conversation
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: "Conversation not found"
            });
        }

        const isParticipant = conversation.participants.some(
            p => p.toString() === userId.toString()
        );
        if (!isParticipant) {
            return res.status(403).json({
                success: false,
                message: "Access denied"
            });
        }

        // Mark all unread messages in this conversation as read
        await Message.updateMany(
            {
                conversation: conversationId,
                recipient: userId,
                read: false
            },
            {
                read: true,
                readAt: new Date()
            }
        );

        res.status(200).json({
            success: true,
            message: "Messages marked as read"
        });
    } catch (error) {
        console.error('Error in markAsRead:', error);
        res.status(500).json({
            success: false,
            message: error.message || "Failed to mark messages as read"
        });
    }
};

// Get unread message count for current user
export const getUnreadCount = async (req, res) => {
    try {
        const userId = req.id;

        const unreadCount = await Message.countDocuments({
            recipient: userId,
            read: false
        });

        res.status(200).json({
            success: true,
            unreadCount
        });
    } catch (error) {
        console.error('Error in getUnreadCount:', error);
        res.status(500).json({
            success: false,
            message: error.message || "Failed to get unread count"
        });
    }
};

// Delete a message (soft delete with audit trail)
export const deleteMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.id;

        // Find the message
        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({
                success: false,
                message: "Message not found"
            });
        }

        // Verify user is the sender
        if (message.sender.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: "You can only delete your own messages"
            });
        }

        // Soft delete the message (keep for audit trail)
        message.deleted = true;
        message.deletedBy = userId;
        message.deletedAt = new Date();
        await message.save();

        res.status(200).json({
            success: true,
            message: "Message deleted successfully"
        });
    } catch (error) {
        console.error('Error in deleteMessage:', error);
        res.status(500).json({
            success: false,
            message: error.message || "Failed to delete message"
        });
    }
};

// Get or create conversation from job application (job-specific chat)
export const getOrCreateJobConversation = async (req, res) => {
    try {
        const { applicationId } = req.params;
        const userId = req.id;

        // Find the application
        const application = await Application.findById(applicationId)
            .populate('job', 'title company created_by')
            .populate('applicant', 'fullname email profile.profilePhoto role');

        if (!application) {
            return res.status(404).json({
                success: false,
                message: "Application not found"
            });
        }

        if (!application.job || !application.applicant) {
            return res.status(400).json({
                success: false,
                message: "Application data is incomplete"
            });
        }

        const jobId = application.job._id;
        const applicantId = application.applicant._id;
        const recruiterId = application.job.created_by;

        if (!jobId || !applicantId || !recruiterId) {
            return res.status(400).json({
                success: false,
                message: "Invalid job or applicant information"
            });
        }

        // Verify user is either the applicant or the recruiter for this job
        if (userId.toString() !== applicantId.toString() && userId.toString() !== recruiterId.toString()) {
            return res.status(403).json({
                success: false,
                message: "You don't have permission to access this conversation"
            });
        }

        // Find existing conversation for this job and these participants
        let conversation = await Conversation.findOne({
            participants: { $all: [applicantId, recruiterId] },
            job: jobId
        })
            .populate('participants', 'fullname email profile.profilePhoto role')
            .populate({
                path: 'job',
                select: 'title company',
                populate: {
                    path: 'company',
                    select: 'name'
                }
            })
            .populate('application', 'status');

        // Create new conversation if it doesn't exist
        if (!conversation) {
            conversation = await Conversation.create({
                participants: [applicantId, recruiterId],
                job: jobId,
                application: applicationId
            });
            conversation = await Conversation.findById(conversation._id)
                .populate('participants', 'fullname email profile.profilePhoto role')
                .populate({
                    path: 'job',
                    select: 'title company',
                    populate: {
                        path: 'company',
                        select: 'name'
                    }
                })
                .populate('application', 'status');
        }

        res.status(200).json({
            success: true,
            conversation
        });
    } catch (error) {
        console.error('Error in getOrCreateJobConversation:', error);
        res.status(500).json({
            success: false,
            message: error.message || "Failed to get or create job conversation"
        });
    }
};

// Get conversation by job and applicant (for recruiters)
export const getConversationByJobAndApplicant = async (req, res) => {
    try {
        const { jobId, applicantId } = req.params;
        const userId = req.id;

        // Verify the job exists and user is the recruiter
        const job = await Job.findById(jobId);
        if (!job) {
            return res.status(404).json({
                success: false,
                message: "Job not found"
            });
        }

        if (!job.created_by || job.created_by.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: "You don't have permission to access this conversation"
            });
        }

        // Verify applicant exists
        const applicant = await User.findById(applicantId);
        if (!applicant) {
            return res.status(404).json({
                success: false,
                message: "Applicant not found"
            });
        }

        // Find or create conversation
        let conversation = await Conversation.findOne({
            participants: { $all: [applicantId, userId] },
            job: jobId
        })
            .populate('participants', 'fullname email profile.profilePhoto role')
            .populate({
                path: 'job',
                select: 'title company',
                populate: {
                    path: 'company',
                    select: 'name'
                }
            })
            .populate('application', 'status');

        // If conversation doesn't exist, find the application and create it
        if (!conversation) {
            const application = await Application.findOne({
                job: jobId,
                applicant: applicantId
            });

            if (!application) {
                return res.status(404).json({
                    success: false,
                    message: "Application not found for this job and applicant"
                });
            }

            conversation = await Conversation.create({
                participants: [applicantId, userId],
                job: jobId,
                application: application._id
            });

            conversation = await Conversation.findById(conversation._id)
                .populate('participants', 'fullname email profile.profilePhoto role')
                .populate({
                    path: 'job',
                    select: 'title company',
                    populate: {
                        path: 'company',
                        select: 'name'
                    }
                })
                .populate('application', 'status');
        }

        if (!conversation) {
            return res.status(500).json({
                success: false,
                message: "Failed to create or retrieve conversation"
            });
        }

        res.status(200).json({
            success: true,
            conversation
        });
    } catch (error) {
        console.error('Error in getConversationByJobAndApplicant:', error);
        res.status(500).json({
            success: false,
            message: error.message || "Failed to get conversation"
        });
    }
};

