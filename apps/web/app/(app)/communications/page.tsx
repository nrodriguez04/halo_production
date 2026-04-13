'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Message {
  id: string;
  channel: string;
  direction: string;
  status: string;
  content: string;
  createdAt: string;
  approvedAt?: string;
  sentAt?: string;
}

const statusVariant = (status: string) => {
  switch (status) {
    case 'pending_approval': return 'warning' as const;
    case 'approved': return 'info' as const;
    case 'sent': return 'success' as const;
    case 'rejected': return 'destructive' as const;
    default: return 'secondary' as const;
  }
};

export default function CommunicationsPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [approvalQueue, setApprovalQueue] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'approval'>('all');

  useEffect(() => {
    fetchMessages();
    fetchApprovalQueue();
  }, []);

  const fetchMessages = async () => {
    try {
      const res = await apiFetch('/communications/messages');
      setMessages(await res.json());
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchApprovalQueue = async () => {
    try {
      const res = await apiFetch('/communications/approval-queue');
      setApprovalQueue(await res.json());
    } catch (error) {
      console.error('Failed to fetch approval queue:', error);
    }
  };

  const handleApprove = async (id: string) => {
    await apiFetch(`/communications/messages/${id}/approve`, { method: 'PUT' });
    fetchMessages();
    fetchApprovalQueue();
  };

  const handleReject = async (id: string) => {
    await apiFetch(`/communications/messages/${id}/reject`, {
      method: 'PUT',
      body: JSON.stringify({ reason: 'Rejected by user' }),
    });
    fetchMessages();
    fetchApprovalQueue();
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading communications...</div>;
  }

  const displayMessages = activeTab === 'approval' ? approvalQueue : messages;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Communications</h1>
        <div className="flex gap-2">
          <Button
            variant={activeTab === 'all' ? 'default' : 'secondary'}
            size="sm"
            onClick={() => setActiveTab('all')}
          >
            All Messages
          </Button>
          <Button
            variant={activeTab === 'approval' ? 'default' : 'secondary'}
            size="sm"
            onClick={() => setActiveTab('approval')}
          >
            Approval Queue
            {approvalQueue.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full">
                {approvalQueue.length}
              </span>
            )}
          </Button>
        </div>
      </div>

      {displayMessages.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">No messages found</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {displayMessages.map((message) => (
            <Card key={message.id}>
              <CardContent className="p-5">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={message.channel === 'sms' ? 'info' : 'success'}>
                      {message.channel.toUpperCase()}
                    </Badge>
                    <Badge variant="secondary">{message.direction}</Badge>
                    <Badge variant={statusVariant(message.status)}>{message.status}</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(message.createdAt).toLocaleString()}
                  </span>
                </div>

                <p className="text-sm text-foreground mb-3">{message.content}</p>

                {message.status === 'pending_approval' && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleApprove(message.id)}>Approve</Button>
                    <Button size="sm" variant="destructive" onClick={() => handleReject(message.id)}>Reject</Button>
                  </div>
                )}

                {message.sentAt && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Sent: {new Date(message.sentAt).toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
