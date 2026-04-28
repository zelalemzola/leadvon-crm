import HeroSection from '@/components/hero-section'
import LogoCloud from '@/components/logo-cloud'
import FeaturesGrid from '@/components/features-2'
import FeaturesAccordion from '@/components/features-12'
import ContentSection from '@/components/content-1'
import StatsSection from '@/components/stats'
import TestimonialsSection from '@/components/testimonials-three'
import FAQsSection from '@/components/faqs-section-two'
import CallToActionSection from '@/components/call-to-action-three'
import FooterSection from '@/components/footer-one'

export default async function LandingPage({
    params,
}: {
    params: Promise<{ locale: string }>
}) {
    const { locale } = await params

    return (
        <div className="bg-background text-foreground">
            <HeroSection locale={locale} />
            <LogoCloud />
            <div id="features">
                <FeaturesGrid />
                <FeaturesAccordion />
            </div>
            <ContentSection />
            <StatsSection />
            <TestimonialsSection />
            <FAQsSection />
            <CallToActionSection locale={locale} />
            <FooterSection locale={locale} />
        </div>
    )
}
