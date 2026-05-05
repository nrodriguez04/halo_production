'use client';

import { useState } from 'react';
import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { PageHeader } from '@/components/page-header';
import { LoadingState, EmptyState, SkeletonTable } from '@/components/states';
import { useReducedMotion, staggerDelay } from '@/lib/motion';
import { MessageSquare, Check, X } from 'lucide-react';

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
    case 'pending_approval':
      return 'warning' as const;
    case 'approved':
      return 'info' as const;
    case 'sent':
      return 'success' as const;
    case 'rejected':
      return 'destructive' as const;
    default:
      return 'secondary' as const;
  }
};

function MessageList({
  messages,
  pendingId,
  onApprove,
  onReject,
}: {
  messages: Message[];
  pendingId: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const reduced = useReducedMotion();

  if (messages.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No messages here"
        description="Outbound and inbound messages will appear in this list."
      />
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((message, i) => (
        <Card
          key={message.id}
          variant="interactive"
          className="animate-fade-up"
          style={{ animationDelay: staggerDelay(i, reduced, 30) }}
        >
          <CardContent className="p-5">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={message.channel === 'sms' ? 'info' : 'success'}>
                  {message.channel.toUpperCase()}
                </Badge>
                <Badge variant="outline">{message.direction}</Badge>
                <Badge variant={statusVariant(message.status)}>
                  {message.status.replace('_', ' ')}
                </Badge>
              </div>
              <span className="text-caption text-muted-foreground">
                {new Date(message.createdAt).toLocaleString()}
              </span>
            </div>

            <p className="mb-3 whitespace-pre-wrap text-body text-foreground">{message.content}</p>

            {message.status === 'pending_approval' && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  loading={pendingId === message.id}
                  onClick={() => onApprove(message.id)}
                >
                  <Check size={14} className="mr-2" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  loading={pendingId === message.id}
                  onClick={() => onReject(message.id)}
                >
                  <X size={14} className="mr-2" />
                  Reject
                </Button>
              </div>
            )}

            {message.sentAt && (
              <p className="mt-2 text-caption text-muted-foreground">
                Sent: {new Date(message.sentAt).toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function CommunicationsPage() {
  const queryClient = useQueryClient();

  const { data: messages = [], isPending: messagesPending } = useApiQuery<Message[]>(
    '/communications/messages',
  );
  const { data: approvalQueue = [], isPending: queuePending } = useApiQuery<Message[]>(
    '/communications/approval-queue',
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['/communications/messages'] });
    queryClient.invalidateQueries({ queryKey: ['/communications/approval-queue'] });
  };

  const approveMutation = useApiMutation<string, void>(
    (id) => apiJson<void>(`/communications/messages/${id}/approve`, { method: 'PUT' }),
    {
      onSuccess: () => {
        toast.success('Message approved');
        invalidate();
      },
      onError: (err: any) => toast.error('Approval failed', { description: err?.message }),
    },
  );

  const rejectMutation = useApiMutation<string, void>(
    (id) =>
      apiJson<void>(`/communications/messages/${id}/reject`, {
        method: 'PUT',
        body: JSON.stringify({ reason: 'Rejected by user' }),
      }),
    {
      onSuccess: () => {
        toast.success('Message rejected');
        invalidate();
      },
      onError: (err: any) => toast.error('Reject failed', { description: err?.message }),
    },
  );

  const isPending = messagesPending || queuePending;
  const pendingId = approveMutation.isPending
    ? approveMutation.variables
    : rejectMutation.isPending
      ? rejectMutation.variables
      : null;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Communications"
        description="Inbound and outbound conversations with leads, plus the human approval queue."
      />

      {isPending ? (
        <LoadingState skeleton>
          <SkeletonTable rows={4} cols={3} />
        </LoadingState>
      ) : (
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All Messages</TabsTrigger>
            <TabsTrigger value="approval" className="flex items-center gap-2">
              Approval Queue
              {approvalQueue.length > 0 && (
                <Badge variant="destructive" className="px-2 py-0 text-[10px]">
                  {approvalQueue.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <MessageList
              messages={messages}
              pendingId={pendingId ?? null}
              onApprove={(id) => approveMutation.mutate(id)}
              onReject={(id) => rejectMutation.mutate(id)}
            />
          </TabsContent>
          <TabsContent value="approval">
            <MessageList
              messages={approvalQueue}
              pendingId={pendingId ?? null}
              onApprove={(id) => approveMutation.mutate(id)}
              onReject={(id) => rejectMutation.mutate(id)}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
