import Link from 'next/link'
import { Button } from '@/components/ui/button'
import ContentSection from '@/components/content-7'
import FeaturesGrid from '@/components/features-2'
import StatsSection from '@/components/stats'
import TestimonialsSection from '@/components/testimonials-three'
import CallToActionSection from '@/components/call-to-action-three'
import FooterSection from '@/components/footer-one'

export default async function AboutPage({
    params,
}: {
    params: Promise<{ locale: string }>
}) {
    const { locale } = await params

    return (
        <div className="bg-background text-foreground">
            <section className="border-b bg-muted/30 py-20">
                <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6">
                    <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">About LeadVon</p>
                    <h1 className="max-w-3xl text-balance text-4xl font-semibold lg:text-6xl">
                        We built LeadVon to make lead delivery clear, fair, and reliable
                    </h1>
                    <p className="text-muted-foreground max-w-2xl text-lg">
                        Our platform helps teams move from ad-hoc lead handling to an automated system with transparent monthly pricing and delivery pacing.
                    </p>
                    <div className="flex gap-3">
                        <Button asChild>
                            <Link href={`/${locale}/contact`}>Talk to Sales</Link>
                        </Button>
                        <Button asChild variant="outline">
                            <Link href={`/${locale}/landing`}>Back to Landing</Link>
                        </Button>
                    </div>
                </div>
            </section>

            <ContentSection />
            <FeaturesGrid />
            <StatsSection />
            <TestimonialsSection />
            <CallToActionSection locale={locale} />
            <FooterSection locale={locale} />
        </div>
    )
}
