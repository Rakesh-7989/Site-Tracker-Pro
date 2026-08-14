import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useOrgBranding } from '@/features/shell/useOrgBranding';
import { BRANDING_PRESETS, brandingPresetToForm, brandingFormToPreset, DEFAULT_BRANDING } from '@/app/brandingQueries';
import { getClient } from '@/lib/supabase';

export const OrgBrandingView = () => {
  const [form] = useForm<{
    logoUrl: string;
    tagline: string;
    accent: 'amber' | 'blue' | 'emerald' | 'violet' | 'rose';
  }>({
    defaultValues: {
      logoUrl: '',
      tagline: DEFAULT_BRANDING.tagline,
      accent: DEFAULT_BRANDING.accent,
    },
  });

  const { data: brand, isLoading } = useOrgBranding(form.getValues().orgId || undefined);
  const { toast } = useToast();
  const router = useRouter();

  const onSubmit = async (values: {
    logoUrl: string;
    tagline: string;
    accent: 'amber' | 'blue' | 'emerald' | 'violet' | 'rose';
  }) => {
    try {
      const client = getClient();
      const { error } = await client
        .from('branding')
        .upsert({
          ...values,
          orgId: (await client.auth.getUser()).user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'orgId' });

      if (error) throw error;

      toast({
        title: 'Branding updated',
        description: 'Org branding has been saved',
      });
      router.refresh();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to save branding',
        variant: 'destructive',
      });
    }
  };

  const onPresetSelect = (presetId: string) => {
    const preset = BRANDING_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      form.setValue('tagline', preset.tagline);
      form.setValue('accent', preset.accent);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Org Branding</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(form.getValues()); }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-2">
              Tagline
            </label>
            <Input
              placeholder="Enter org tagline"
              {...form.getInputProps('tagline')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-2">
              Accent Color
            </label>
            <Select
              onValueChange={(val) => form.setValue('accent', val)}
              defaultValue='blue'
            >
              <SelectTrigger>
                <SelectValue placeholder="Select accent color" />
              </SelectTrigger>
              <SelectContent>
                {BRANDING_PRESETS.map((preset) => (
                  <SelectItem key={preset.id} value={preset.accent}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-2">
              Logo URL (optional)
            </label>
            <Input
              placeholder="https://example.com/logo.png"
              {...form.getInputProps('logoUrl')}
            />
            <p className="text-xs text-fg-tertiary mt-1">
              Supported formats: PNG, JPG, SVG. Recommended size: 120×40px.
            </p>
          </div>

          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? 'Saving...' : 'Save Branding'}
          </Button>

          <div className="mt-4 pt-4 border-t border-default">
            <h4 className="text-xs font-semibold text-fg-tertiary mb-2">Presets</h4>
            <div className="grid grid-cols-2 gap-2">
              {BRANDING_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  variant="outline"
                  size="sm"
                  onClick={() => onPresetSelect(preset.id)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};