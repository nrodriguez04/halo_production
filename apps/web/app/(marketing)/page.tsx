import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, Zap, LayoutGrid } from 'lucide-react';

const features = [
  {
    icon: Shield,
    title: 'Security & Compliance',
    description:
      'PII encryption, consent management, DNC lists, and full audit trails.',
  },
  {
    icon: Zap,
    title: 'AI-Powered',
    description:
      'Automated underwriting, comps analysis, and marketing generation with cost controls.',
  },
  {
    icon: LayoutGrid,
    title: 'Full Pipeline',
    description:
      'Lead intake through closing with deal management, contracts, and buyer matching.',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-6">
          <div className="text-2xl font-bold text-primary">Hālo</div>
          <Link href="/sign-in">
            <Button>Login</Button>
          </Link>
        </div>

        <div className="py-24 text-center">
          <h1 className="text-5xl sm:text-6xl font-bold text-foreground mb-6 tracking-tight">
            Internal AI Wholesaling
            <span className="block text-primary">Platform</span>
          </h1>
          <p className="text-lg text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
            Streamline your real estate wholesaling operations with AI-powered
            lead enrichment, underwriting, and communications.
          </p>

          <div className="grid sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <Card key={f.title} className="text-left">
                  <CardContent className="p-6">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                      <Icon size={20} className="text-primary" />
                    </div>
                    <h2 className="text-base font-semibold text-foreground mb-2">
                      {f.title}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {f.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
