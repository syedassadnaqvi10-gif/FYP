import express from 'express';
import { 
    getOrCreateConversation, 
    getConversations, 
    getMessages, 
    sendMessage, 
    markAsRead,
    getUnreadCount,
    deleteMessage,
    getOrCreateJobConversation,
    getConversationByJobAndApplicant
} from '../controllers/chat.controller.js';
import isAuthenticated from '../middlewares/isAuthenticated.js';

const router = express.Router();

// All routes require authentication
router.use(isAuthenticated);

// Get all conversations for the current user
router.get('/conversations', getConversations);

// Get or create a conversation with a specific user
router.get('/conversation/:recipientId', getOrCreateConversation);

// Get or create conversation from job application (job-specific)
router.get('/application/:applicationId/conversation', getOrCreateJobConversation);

// Get conversation by job and applicant (for recruiters)
router.get('/job/:jobId/applicant/:applicantId/conversation', getConversationByJobAndApplicant);

// Get messages for a conversation
router.get('/conversation/:conversationId/messages', getMessages);

// Send a message
router.post('/message', sendMessage);

// Mark messages as read
router.put('/conversation/:conversationId/read', markAsRead);

// Get unread message count
router.get('/unread-count', getUnreadCount);

// Delete a message
router.delete('/message/:messageId', deleteMessage);

export default router;

