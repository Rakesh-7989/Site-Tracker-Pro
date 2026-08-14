import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';
import { NotificationType } from '@/app/notificationTemplates';
import { sendOrgNotification } from '@/app/orgBroadcastQueries';

const NotificationTypeOptions = [
  { value: 'welcome' as const, label: 'Welcome' },
  { value: 'weekly_digest' as const, label: 'Weekly Digest' },
  { value: 'system_alert' as const, label: 'System Alert' },
  { value: 'dpr_submitted' as const, label: 'DPR Submitted' },
  { value: 'dpr_approved' as const, label: 'DPR Approved' },
  { value: 'dpr_rejected' as const, label: 'DPR Rejected' },
  { value: 'dpr_reminder' as const, label: 'DPR Reminder' },
  { value: 'dpr_deadline_approaching' as const, label: 'DPR Deadline Approaching' },
  { value: 'project_milestone' as const, label: 'Project Milestone' },
  { value: 'project_deadline_approaching' as const, label: 'Project Deadline Approaching' },
  { value: 'invoice_generated' as const, label: 'Invoice Generated' },
  { value: 'invoice_overdue' as const, label: 'Invoice Overdue' },
  { value: 'invoice_paid' as const, label: 'Invoice Paid' },
  { value: 'ra_bill_generated' as const, label: 'RA Bill Generated' },
  { value: 'ra_bill_paid' as const, label: 'RA Bill Paid' },
];

export const OrgBroadcastView = () => {
  const [formValues, setFormValues] = useForm<{
    orgId: string;
    notificationType: NotificationType;
    placeholders: Record<string, string>;
  }>({
    defaultValues: {
      orgId: '',
      notificationType: 'welcome' as NotificationType,
      placeholders: {},
    },
  });

  const { data: result, isLoading, isError, error } = useState<{
    success: boolean;
    sent_count: number;
    failed_count: number;
    error: string | null;
  } | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  const onSubmit = async (values: {
    orgId: string;
    notificationType: NotificationType;
    placeholders: Record<string, string>;
  }) => {
    try {
      const response = await sendOrgNotification(
        values.orgId,
        values.notificationType,
        values.placeholders
      );

      if (response.success) {
        setResult({ success: true, sent_count: response.sent_count, failed_count: response.failed_count, error: null });
        toast({
          title: 'Success',
          description: `Notification sent to ${response.sent_count} org members (${response.failed_count} failed)`,
        });
        router.refresh();
      } else {
        setResult({ success: false, sent_count: 0, failed_count: 0, error: response.error });
        toast({
          title: 'Failed',
          description: response.error || 'Failed to send notification',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      setResult({ success: false, sent_count: 0, failed_count: 0, error: err.message });
      toast({
        title: 'Error',
        description: err.message || 'Network error',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    if (result?.success === false) {
      toast({
        title: 'Failed',
        description: result.error || 'Failed to send notification',
        variant: 'destructive',
      });
    }
  }, [result, toast]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Org Broadcast Notification</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(formValues); }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-2">
              Organization
            </label>
            <Input
              placeholder="Select organization"
              {...form.getInputProps('orgId')}
              onChange={(e) => setFormValues({ ...formValues, orgId: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-2">
              Notification Type
            </label>
            <Select
              onValueChange={(val) => setFormValues({ ...formValues, notificationType: val })}
              defaultValue='welcome'
            >
              <SelectTrigger>
                <SelectValue placeholder="Select notification type" />
              </SelectTrigger>
              <SelectContent>
                {NotificationTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-2">
              Placeholders
            </label>
            <p className="text-xs text-fg-tertiary mb-2">
              Available for selected type
            </p>
            <div className="space-y-1">
              {NotificationTypeOptions.forEach((opt) => {
                return (
                  <div key={opt.value} className="flex items-center">
                    <Input
                      placeholder={opt.label}
                      {...form.getInputProps(`ph_${opt.value}`, {
                        value: formValues.placeholders?.[`ph_${opt.value}`] || '',
                        onChange: (e) =>
                          setFormValues({
                            ...formValues,
                            placeholders: {
                              ...formValues.placeholders,
                              [`ph_${opt.value}`]: e.target.value,
                            },
                          }),
                      })}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Sending...' : 'Send Org Broadcast'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};