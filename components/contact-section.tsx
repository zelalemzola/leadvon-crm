'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, MessageSquare, Phone } from 'lucide-react'

export default function ContactSection() {
    return (
        <section id="contact" className="py-16 md:py-24">
            <div className="mx-auto max-w-5xl px-6">
                <div className="space-y-6">
                    <h1 className="text-4xl font-semibold lg:text-5xl">Talk to the LeadVon team</h1>
                    <p className="text-muted-foreground">
                        Tell us your target categories, monthly goals, and current lead workflow. We will help you launch a cleaner billing and delivery process.
                    </p>

                    <div className="grid gap-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Mail className="size-4" />
                                    Email
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="text-muted-foreground text-sm">sales@leadvon.com</CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Phone className="size-4" />
                                    Phone
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="text-muted-foreground text-sm">+1 (555) 010-2233</CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <MessageSquare className="size-4" />
                                    Support Hours
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="text-muted-foreground text-sm">Monday - Friday, 9:00 AM to 6:00 PM</CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </section>
    )
}
