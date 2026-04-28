import { Button } from '@/components/ui/button'
import { Calendar, ChevronRight } from 'lucide-react'
import Link from 'next/link'

export default function CallToActionSection({ locale = 'en' }: { locale?: string }) {
    return (
        <section>
            <div className="bg-muted py-12">
                <div className="mx-auto max-w-5xl px-6">
                    <h2 className="text-foreground max-w-lg text-balance text-3xl font-semibold lg:text-4xl">
                        <span className="text-muted-foreground">Ready to modernize lead delivery?</span> Start with LeadVon
                    </h2>
                    <p className="mt-4 text-lg">Set your pricing, activate client flows, and let the platform automate the rest.</p>
                    <div className="mt-8 flex gap-3">
                        <Button
                            asChild
                            className="pr-2">
                            <Link href={`/${locale}/signup`}>
                                Start Free Setup
                                <ChevronRight
                                    strokeWidth={2.5}
                                    className="size-3.5! opacity-50"
                                />
                            </Link>
                        </Button>
                        <Button
                            asChild
                            variant="outline"
                            className="pl-2.5">
                            <Link href={`/${locale}/contact`}>
                                <Calendar
                                    className="!size-3.5 opacity-50"
                                    strokeWidth={2.5}
                                />
                                Book a Demo
                            </Link>
                        </Button>
                    </div>
                </div>
            </div>
        </section>
    )
}
