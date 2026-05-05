import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, Zap, LayoutGrid, ArrowRight, Sparkles } from 'lucide-react';

const features = [
  {
    icon: Shield,
    title: 'Security & Compliance',
    description:
      'PII encryption, consent management, DNC lists, and full audit trails on every action.',
  },
  {
    icon: Zap,
    title: 'AI-Powered',
    description:
      'Automated underwriting, comp analysis, and marketing — gated by hard cost caps.',
  },
  {
    icon: LayoutGrid,
    title: 'Full Pipeline',
    description:
      'Lead intake through closing — deal management, contracts, and buyer matching in one tool.',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-hidden bg-background">
      {/* Subtle gradient backdrop. The radial fade keeps the hero from
          looking flat without competing with content underneath. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 80% 50% at 50% -20%, hsl(var(--primary) / 0.18), transparent 70%)',
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between py-6">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md text-h3 font-bold tracking-tight text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Hālo
          </Link>
          <Button asChild>
            <Link href="/sign-in">Login</Link>
          </Button>
        </header>

        <section className="py-24 text-center">
          <div className="mx-auto inline-flex animate-fade-up items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-caption font-medium text-muted-foreground backdrop-blur-sm">
            <Sparkles size={12} className="text-primary" aria-hidden />
            Internal Use Only
          </div>

          <h1
            className="mt-6 animate-fade-up text-display font-bold tracking-tight text-foreground sm:text-[3.75rem] sm:leading-[1.1]"
            style={{ animationDelay: '60ms' }}
          >
            Internal AI Wholesaling
            <span className="mt-1 block bg-gradient-to-r from-primary to-emerald-300 bg-clip-text text-transparent">
              Platform
            </span>
          </h1>

          <p
            className="mx-auto mt-6 max-w-2xl animate-fade-up text-h3 leading-relaxed text-muted-foreground"
            style={{ animationDelay: '120ms' }}
          >
            Streamline real-estate wholesaling with AI-powered lead enrichment, underwriting, and
            communications — running under hard governance.
          </p>

          <div
            className="mt-10 flex animate-fade-up justify-center gap-3"
            style={{ animationDelay: '180ms' }}
          >
            <Button asChild size="lg" className="group">
              <Link href="/sign-in">
                Get Started
                <ArrowRight
                  size={16}
                  className="ml-2 transition-transform duration-fast ease-out-expo group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/dashboard">View Dashboard</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 pb-24 sm:grid-cols-3">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <Card
                key={f.title}
                variant="interactive"
                className="animate-fade-up text-left"
                style={{ animationDelay: `${240 + i * 60}ms` }}
              >
                <CardContent className="p-6">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
                    <Icon size={20} className="text-primary" aria-hidden />
                  </div>
                  <h2 className="mb-2 text-h3 font-semibold text-foreground">{f.title}</h2>
                  <p className="text-body text-muted-foreground">{f.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </section>
      </div>
    </div>
  );
}
