import Link from 'next/link'
import { Button } from '@/components/ui/button'
import ContactSection from '@/components/contact-section'
import FAQsSection from '@/components/faqs-section-two'
import FooterSection from '@/components/footer-one'

export default async function ContactPage({
    params,
}: {
    params: Promise<{ locale: string }>
}) {
    const { locale } = await params

    return (
        <div className="bg-background text-foreground">
            <section className="border-b bg-muted/30 py-16">
                <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6">
                    <div>
                        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">LeadVon Contact</p>
                        <h1 className="mt-2 text-3xl font-semibold md:text-4xl">Let&apos;s plan your lead flow</h1>
                    </div>
                    <Button asChild variant="outline">
                        <Link href={`/${locale}/landing`}>Back to Landing</Link>
                    </Button>
                </div>
            </section>

            <ContactSection />
            <FAQsSection />
            <FooterSection locale={locale} />
        </div>
    )
}
