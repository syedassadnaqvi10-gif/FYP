import React from 'react'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { MoreHorizontal, MessageCircle } from 'lucide-react';
import { useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { APPLICATION_API_END_POINT, CHAT_API_END_POINT } from '@/utils/constant';
import axios from 'axios';

const shortlistingStatus = ["Accepted", "Rejected"];

const ApplicantsTable = () => {
    const { applicants } = useSelector(store => store.application);
    const navigate = useNavigate();
    const params = useParams();
    const jobId = params.id;

    const handleChatWithApplicant = async (applicantId, applicationId) => {
        try {
            if (!applicantId || !applicationId) {
                toast.error('Invalid applicant or application information');
                return;
            }

            // Try to get existing conversation first
            let res;
            try {
                res = await axios.get(
                    `${CHAT_API_END_POINT}/job/${jobId}/applicant/${applicantId}/conversation`,
                    { withCredentials: true }
                );
                
                // If conversation exists, navigate to it
                if (res.data.success && res.data.conversation && res.data.conversation._id) {
                    navigate(`/chat?conversationId=${res.data.conversation._id}`);
                    return;
                }
            } catch (error) {
                // If conversation doesn't exist (404) or other error, create one from application
                if (error.response?.status === 404 || error.response?.status === 400) {
                    try {
                        res = await axios.get(
                            `${CHAT_API_END_POINT}/application/${applicationId}/conversation`,
                            { withCredentials: true }
                        );
                    } catch (createError) {
                        console.error('Error creating conversation:', createError);
                        toast.error(createError.response?.data?.message || 'Failed to create conversation');
                        return;
                    }
                } else {
                    console.error('Error getting conversation:', error);
                    toast.error(error.response?.data?.message || 'Failed to start conversation');
                    return;
                }
            }
            
            // Verify response structure
            if (res && res.data && res.data.success && res.data.conversation && res.data.conversation._id) {
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

    const statusHandler = async (status, id) => {
        console.log('called');
        try {
            axios.defaults.withCredentials = true;
            const res = await axios.post(`${APPLICATION_API_END_POINT}/status/${id}/update`, { status });
            console.log(res);
            if (res.data.success) {
                toast.success(res.data.message);
            }
        } catch (error) {
            toast.error(error.response.data.message);
        }
    }

    // Handler to open applicant resume using backend proxy endpoint
    const handleResumeClick = (e, applicationId) => {
        e.preventDefault();
        // Use backend proxy endpoint to serve PDF with proper headers
        const resumeUrl = `${APPLICATION_API_END_POINT}/${applicationId}/resume`;
        window.open(resumeUrl, '_blank', 'noopener,noreferrer');
    };

    return (
        <div>
            <Table>
                <TableCaption>A list of your recent applied user</TableCaption>
                <TableHeader>
                    <TableRow>
                        <TableHead>FullName</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Resume</TableHead>
                        <TableHead>Quiz Result</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {
                        applicants && applicants?.applications?.map((item) => (
                            <TableRow key={item._id}>
                                <TableCell>{item?.applicant?.fullname}</TableCell>
                                <TableCell>{item?.applicant?.email}</TableCell>
                                <TableCell>{item?.applicant?.phoneNumber}</TableCell>
                                <TableCell >
                                    {
                                        item.applicant?.profile?.resume ? (
                                            <a 
                                                onClick={(e) => handleResumeClick(e, item._id)}
                                                className="text-blue-600 hover:text-blue-800 underline cursor-pointer break-all" 
                                            >
                                                {item?.applicant?.profile?.resumeOriginalName || 'View Resume'}
                                            </a>
                                        ) : (
                                            <span className="text-gray-400">NA</span>
                                        )
                                    }
                                </TableCell>
                                <TableCell>
                                    {item?.quizScore !== null && item?.quizScore !== undefined ? (
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium">Score: {item.quizScore}%</span>
                                                {item?.quizPassed !== null && item?.quizPassed !== undefined && (
                                                    <Badge className={item.quizPassed ? 'bg-green-500' : 'bg-red-500'}>
                                                        {item.quizPassed ? 'Passed' : 'Failed'}
                                                    </Badge>
                                                )}
                                            </div>
                                            {item?.quizResults && item.quizResults.length > 0 && (
                                                <span className="text-xs text-gray-500">
                                                    {item.quizResults.filter(r => r.isCorrect).length}/{item.quizResults.length} correct
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-gray-400">No Quiz</span>
                                    )}
                                </TableCell>
                                <TableCell>{item?.createdAt?.split("T")[0] || item?.applicant?.createdAt?.split("T")[0]}</TableCell>
                                <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                if (!item?.applicant?._id || !item?._id) {
                                                    toast.error('Invalid applicant data');
                                                    return;
                                                }
                                                handleChatWithApplicant(item.applicant._id, item._id);
                                            }}
                                            className="gap-2"
                                            disabled={!item?.applicant?._id || !item?._id}
                                        >
                                            <MessageCircle className="h-4 w-4" />
                                            Chat
                                        </Button>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant="ghost" size="sm">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-32">
                                                {
                                                    shortlistingStatus.map((status, index) => {
                                                        return (
                                                            <div onClick={() => statusHandler(status, item?._id)} key={index} className='flex w-fit items-center my-2 cursor-pointer hover:bg-gray-100 p-2 rounded'>
                                                                <span>{status}</span>
                                                            </div>
                                                        )
                                                    })
                                                }
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                </TableCell>

                            </TableRow>
                        ))
                    }

                </TableBody>

            </Table>
        </div>
    )
}

export default ApplicantsTable