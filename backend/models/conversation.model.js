import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema({
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],
    job: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Job',
        default: null // null for general chats, ObjectId for job-specific chats
    },
    application: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Application',
        default: null // Link to the specific application
    },
    lastMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        default: null
    },
    lastMessageAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Index to ensure unique conversations between two users for a specific job
conversationSchema.index({ participants: 1, job: 1 });
conversationSchema.index({ participants: 1 }); // For general chats
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ job: 1 });
conversationSchema.index({ application: 1 });

// Method to get the other participant
conversationSchema.methods.getOtherParticipant = function(currentUserId) {
    return this.participants.find(p => p.toString() !== currentUserId.toString());
};

export const Conversation = mongoose.model('Conversation', conversationSchema);

