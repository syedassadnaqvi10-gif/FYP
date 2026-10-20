import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import connectDB from "./utils/db.js";
import userRoute from "./routes/user.route.js";
import companyRoute from "./routes/company.route.js";
import jobRoute from "./routes/job.route.js";
import applicationRoute from "./routes/application.route.js";
import categoryRoute from "./routes/category.route.js";
import questionRoute from "./routes/question.route.js";
import resumeRoute from "./routes/resume.route.js";
import chatRoute from "./routes/chat.route.js";
import { Message } from "./models/message.model.js";
import { Conversation } from "./models/conversation.model.js";

dotenv.config({});

const app = express();

// middleware
const corsOptions = {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials:true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition']
}

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(cookieParser());

const PORT = process.env.PORT || 8000;


// api's
app.use("/api/v1/user", userRoute);
app.use("/api/v1/company", companyRoute);
app.use("/api/v1/job", jobRoute);
app.use("/api/v1/application", applicationRoute);
app.use("/api/v1/category", categoryRoute);
app.use("/api/v1/question", questionRoute);
app.use("/api/v1/resume", resumeRoute);
app.use("/api/v1/chat", chatRoute);

// Health check route
app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "FutureScope Backend API is running!",
        status: "online",
        endpoints: {
            user: "/api/v1/user",
            job: "/api/v1/job",
            company: "/api/v1/company",
            application: "/api/v1/application",
            category: "/api/v1/category",
            question: "/api/v1/question",
            resume: "/api/v1/resume",
            chat: "/api/v1/chat"
        }
    });
});

// Health check endpoint
app.get("/health", (req, res) => {
    res.status(200).json({
        success: true,
        status: "healthy",
        timestamp: new Date().toISOString()
    });
});

// Create HTTP server and Socket.IO instance
const httpServer = createServer(app);

const io = new Server(httpServer, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:5173',
        credentials: true,
        methods: ['GET', 'POST']
    }
});

// Socket.IO authentication middleware
io.use(async (socket, next) => {
    try {
        // Try to get token from auth object first, then from cookies
        let token = socket.handshake.auth?.token;
        
        if (!token) {
            // Extract from cookies
            const cookieHeader = socket.handshake.headers.cookie;
            if (cookieHeader) {
                const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
                    const [key, value] = cookie.trim().split('=');
                    acc[key] = value;
                    return acc;
                }, {});
                token = cookies.token;
            }
        }
        
        if (!token) {
            return next(new Error('Authentication error: No token provided'));
        }

        const decoded = jwt.verify(token, process.env.SECRET_KEY);
        if (!decoded || !decoded.userId) {
            return next(new Error('Authentication error: Invalid token'));
        }

        socket.userId = decoded.userId;
        next();
    } catch (error) {
        next(new Error('Authentication error: ' + error.message));
    }
});

// Store active users (userId -> socketId)
const activeUsers = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
    const userId = socket.userId;
    activeUsers.set(userId, socket.id);
    
    console.log(`User ${userId} connected: ${socket.id}`);
    
    // Join user's personal room
    socket.join(`user_${userId}`);

    // Broadcast user is online to all their conversations
    socket.broadcast.emit('user_status_change', {
        userId,
        status: 'online'
    });

    // Join conversation rooms
    socket.on('join_conversation', async (conversationId) => {
        socket.join(`conversation_${conversationId}`);
        console.log(`✅ User ${userId} joined conversation ${conversationId}`);
        
        // Notify others in conversation that user is online
        socket.to(`conversation_${conversationId}`).emit('user_status_change', {
            userId,
            status: 'online',
            conversationId
        });
        
        // Also ensure user stays in their personal room
        socket.join(`user_${userId}`);
    });

    // Leave conversation room
    socket.on('leave_conversation', (conversationId) => {
        socket.leave(`conversation_${conversationId}`);
        console.log(`User ${userId} left conversation ${conversationId}`);
    });

    // Handle new message
    socket.on('send_message', async (data) => {
        try {
            const { conversationId, recipientId, content } = data;

            // Create message in database
            const message = await Message.create({
                conversation: conversationId,
                sender: userId,
                recipient: recipientId,
                content: content.trim(),
                read: false
            });

            // Populate message
            const populatedMessage = await Message.findById(message._id)
                .populate('sender', 'fullname email profile.profilePhoto role')
                .populate('recipient', 'fullname email profile.profilePhoto role');

            // Update conversation
            await Conversation.findByIdAndUpdate(conversationId, {
                lastMessage: message._id,
                lastMessageAt: new Date()
            });

            // Ensure sender is in the conversation room
            const senderSocket = activeUsers.get(userId);
            if (senderSocket) {
                const senderSocketObj = io.sockets.sockets.get(senderSocket);
                if (senderSocketObj) {
                    senderSocketObj.join(`conversation_${conversationId}`);
                }
            }

            // Ensure recipient is also in the conversation room (they should join when viewing)
            const recipientSocket = activeUsers.get(recipientId);
            if (recipientSocket) {
                const recipientSocketObj = io.sockets.sockets.get(recipientSocket);
                if (recipientSocketObj) {
                    recipientSocketObj.join(`conversation_${conversationId}`);
                    console.log(`✅ Recipient ${recipientId} joined conversation room`);
                }
            }

            // Convert populatedMessage to plain object for socket emission
            const messageData = {
                _id: populatedMessage._id.toString(),
                conversation: conversationId.toString(), // Ensure it's a string
                sender: {
                    _id: populatedMessage.sender._id.toString(),
                    fullname: populatedMessage.sender.fullname,
                    email: populatedMessage.sender.email,
                    profile: populatedMessage.sender.profile,
                    role: populatedMessage.sender.role
                },
                recipient: {
                    _id: populatedMessage.recipient._id.toString(),
                    fullname: populatedMessage.recipient.fullname,
                    email: populatedMessage.recipient.email,
                    profile: populatedMessage.recipient.profile,
                    role: populatedMessage.recipient.role
                },
                content: populatedMessage.content,
                read: populatedMessage.read,
                deleted: populatedMessage.deleted || false,
                createdAt: populatedMessage.createdAt
            };

            // Emit to conversation room (all participants)
            io.to(`conversation_${conversationId}`).emit('new_message', messageData);
            console.log(`📤 [BACKEND] Emitted new_message to conversation_${conversationId} room`);
            
            // Emit to recipient's personal room (ALWAYS - this is the most reliable method)
            io.to(`user_${recipientId}`).emit('new_message', messageData);
            console.log(`📤 [BACKEND] Emitted new_message to user_${recipientId} personal room`);
            
            // Emit to sender's personal room (for confirmation)
            io.to(`user_${userId}`).emit('new_message', messageData);
            console.log(`📤 [BACKEND] Emitted new_message to sender's personal room: user_${userId}`);
            
            // CRITICAL: Also emit directly to sockets as fallback (most reliable)
            if (senderSocket) {
                io.to(senderSocket).emit('new_message', messageData);
                console.log(`📤 [BACKEND] Emitted directly to sender socket: ${senderSocket}`);
            }
            if (recipientSocket) {
                io.to(recipientSocket).emit('new_message', messageData);
                console.log(`📤 [BACKEND] Emitted directly to recipient socket: ${recipientSocket}`);
            } else {
                console.log(`⚠️ [BACKEND] Recipient socket not found for user ${recipientId}`);
            }
            
            // Emit notification events
            io.to(`user_${recipientId}`).emit('message_received', messageData);
            io.to(`user_${recipientId}`).emit('new_message_notification', {
                message: messageData,
                conversationId: conversationId.toString()
            });

        } catch (error) {
            console.error('Error handling send_message:', error);
            socket.emit('message_error', { message: 'Failed to send message' });
        }
    });

    // Handle typing indicator
    socket.on('typing', (data) => {
        socket.to(`conversation_${data.conversationId}`).emit('user_typing', {
            userId,
            conversationId: data.conversationId,
            isTyping: data.isTyping
        });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        activeUsers.delete(userId);
        console.log(`User ${userId} disconnected: ${socket.id}`);
        
        // Broadcast user is offline
        socket.broadcast.emit('user_status_change', {
            userId,
            status: 'offline'
        });
    });

    // Handle message deletion
    socket.on('delete_message', async (data) => {
        try {
            const { messageId, conversationId } = data;
            
            // Verify and delete message (handled by controller, but emit to room)
            // Emit deletion event to conversation room
            io.to(`conversation_${conversationId}`).emit('message_deleted', {
                messageId,
                conversationId
            });
        } catch (error) {
            console.error('Error handling delete_message:', error);
        }
    });
});

// Make io accessible to other modules if needed
app.set('io', io);

// Start server and connect to database
const startServer = async () => {
    // Start HTTP server with Socket.IO - bind to 0.0.0.0 for Railway/cloud hosting
    httpServer.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running at port ${PORT}`);
        console.log(`Socket.IO server initialized`);
        console.log(`CORS enabled for: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
    });
    
    // Connect to database (will retry if it fails)
    // Don't block server startup - connection will retry in background
    connectDB().catch(error => {
        console.error('Initial database connection failed:', error.message);
        console.log('Server is running. Database connection will retry automatically.');
    });
};

startServer();