import React from 'react'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { MessageCircle } from 'lucide-react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { CHAT_API_END_POINT } from '@/utils/constant'
import { toast } from 'sonner'

const AppliedJobTable = () => {
    const {allAppliedJobs} = useSelector(store=>store.job);
    const navigate = useNavigate();

    const handleChatWithRecruiter = async (applicationId) => {
        try {
            if (!applicationId) {
                toast.error('Invalid application information');
                return;
            }

            const res = await axios.get(
                `${CHAT_API_END_POINT}/application/${applicationId}/conversation`,
                { withCredentials: true }
            );
            
            if (res.data && res.data.success && res.data.conversation && res.data.conversation._id) {
                navigate(`/chat?conversationId=${res.data.conversation._id}`);
            } else {
                console.error('Invalid conversation response:', res?.data);
                toast.error('Failed to start conversation. Invalid response from server.');
            }
        } catch (error) {
            console.error('Error starting conversation:', error);
            toast.error(error.response?.data?.message || 'Failed to start conversation');
        }
    };

    return (
        <div>
            <Table>
                <TableCaption>A list of your applied jobs</TableCaption>
                <TableHeader>
                    <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Job Role</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {
                        allAppliedJobs && allAppliedJobs.length > 0 ? (
                            allAppliedJobs.map((appliedJob) => (
                                <TableRow key={appliedJob._id}>
                                    <TableCell>{appliedJob?.createdAt?.split("T")[0]}</TableCell>
                                    <TableCell>{appliedJob.job?.title}</TableCell>
                                    <TableCell>{appliedJob.job?.company?.name}</TableCell>
                                    <TableCell>
                                        <Badge className={`${appliedJob?.status === "rejected" ? 'bg-red-400' : appliedJob.status === 'pending' ? 'bg-gray-400' : 'bg-green-400'}`}>
                                            {appliedJob.status.toUpperCase()}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleChatWithRecruiter(appliedJob._id)}
                                            className="gap-2"
                                        >
                                            <MessageCircle className="h-4 w-4" />
                                            Chat with Recruiter
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                                    You haven't applied for any job yet.
                                </TableCell>
                            </TableRow>
                        )
                    }
                </TableBody>
            </Table>
        </div>
    )
}

export default AppliedJobTable