'use client'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import Link from 'next/link'

export default function FAQs() {
    const faqItems = [
        {
            id: 'item-1',
            question: 'How does billing work in LeadVon?',
            answer: 'Clients choose a category, lead type, and monthly quantity, then pay through Stripe. Lead delivery charges are automatically tracked against their prepaid budget.',
        },
        {
            id: 'item-2',
            question: 'Can clients see pricing before paying?',
            answer: 'Yes. The billing page shows live price per lead and monthly total based on configured tiers and minimum order rules.',
        },
        {
            id: 'item-3',
            question: 'What happens if lead inventory is low?',
            answer: 'Undelivered volume stays in queue. The system keeps delivering automatically as soon as matching leads become available.',
        },
        {
            id: 'item-4',
            question: 'What if the prepaid budget runs out?',
            answer: 'Delivery pauses automatically until the client adds new budget. Once topped up, delivery resumes.',
        },
        {
            id: 'item-5',
            question: 'Can we manage multiple client team members?',
            answer: 'Yes. Customer admins can create and manage team users, assign leads, and control who can perform billing actions.',
        },
    ]

    return (
        <section className="py-16 md:py-24">
            <div className="mx-auto max-w-5xl px-6">
                <div className="grid gap-8 md:grid-cols-5 md:gap-12">
                    <div className="md:col-span-2">
                        <h2 className="text-foreground text-4xl font-semibold">FAQs</h2>
                        <p className="text-muted-foreground mt-4 text-balance text-lg">Everything teams ask before switching to LeadVon</p>
                        <p className="text-muted-foreground mt-6 hidden md:block">
                            Can't find what you're looking for? Contact our{' '}
                            <Link
                                href="#"
                                className="text-primary font-medium hover:underline">
                                support team
                            </Link>
                        </p>
                    </div>

                    <div className="md:col-span-3">
                        <Accordion
                            type="single"
                            collapsible>
                            {faqItems.map((item) => (
                                <AccordionItem
                                    key={item.id}
                                    value={item.id}>
                                    <AccordionTrigger className="cursor-pointer text-base hover:no-underline">{item.question}</AccordionTrigger>
                                    <AccordionContent>
                                        <p className="text-base">{item.answer}</p>
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                        </Accordion>
                    </div>

                    <p className="text-muted-foreground mt-6 md:hidden">
                            Can't find what you're looking for? Contact our{' '}
                        <Link
                            href="#"
                            className="text-primary font-medium hover:underline">
                                support team
                        </Link>
                    </p>
                </div>
            </div>
        </section>
    )
}
