'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Menu, X } from 'lucide-react'

const navItems = [
    { name: 'Features', href: '#features' },
    { name: 'About', href: '#about' },
    { name: 'Contact', href: '#contact' },
]

export default function HeroSection({ locale = 'en' }: { locale?: string }) {
    const [menuState, setMenuState] = useState(false)

    return (
        <>
            <header>
                <nav
                    data-state={menuState ? 'active' : ''}
                    className="fixed z-20 w-full border-b border-dashed bg-white/95 backdrop-blur md:relative dark:bg-zinc-950/95">
                    <div className="m-auto max-w-5xl px-6">
                        <div className="flex flex-wrap items-center justify-between gap-6 py-3 lg:gap-0 lg:py-4">
                            <div className="flex w-full justify-between lg:w-auto">
                                <Link href={`/${locale}/landing`} aria-label="LeadVon home" className="text-lg font-semibold tracking-tight">
                                    LeadVon
                                </Link>
                                <button
                                    onClick={() => setMenuState(!menuState)}
                                    aria-label={menuState ? 'Close Menu' : 'Open Menu'}
                                    className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden">
                                    <Menu className="in-data-[state=active]:rotate-180 in-data-[state=active]:scale-0 in-data-[state=active]:opacity-0 m-auto size-6 duration-200" />
                                    <X className="in-data-[state=active]:rotate-0 in-data-[state=active]:scale-100 in-data-[state=active]:opacity-100 absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200" />
                                </button>
                            </div>

                            <div className="bg-background in-data-[state=active]:block lg:in-data-[state=active]:flex mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border p-6 shadow-2xl shadow-zinc-300/20 md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none dark:shadow-none dark:lg:bg-transparent">
                                <div className="lg:pr-4">
                                    <ul className="space-y-6 text-base lg:flex lg:gap-8 lg:space-y-0 lg:text-sm">
                                        {navItems.map((item) => (
                                            <li key={item.name}>
                                                <Link href={item.href} className="text-muted-foreground hover:text-accent-foreground block duration-150">
                                                    {item.name}
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit lg:border-l lg:pl-6">
                                    <Button asChild variant="outline" size="sm">
                                        <Link href={`/${locale}/login`}>Log in</Link>
                                    </Button>
                                    <Button asChild size="sm">
                                        <Link href={`/${locale}/signup`}>Get Started</Link>
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </nav>
            </header>

            <main>
                <section className="overflow-hidden bg-muted/40 py-24 md:py-32">
                    <div className="mx-auto max-w-5xl px-6">
                        <div className="mx-auto max-w-3xl text-center">
                            <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">Lead Delivery Platform</p>
                            <h1 className="mt-4 text-balance text-4xl font-semibold md:text-5xl lg:text-6xl">
                                Buy leads with clear monthly pricing and automated delivery
                            </h1>
                            <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-lg">
                                LeadVon helps insurance teams buy qualified leads by category, pay through Stripe, and receive leads automatically against prepaid budget and delivery pace.
                            </p>
                            <div className="mt-8 flex flex-wrap justify-center gap-3">
                                <Button asChild size="lg">
                                    <Link href={`/${locale}/signup`}>Start Free Setup</Link>
                                </Button>
                                <Button asChild variant="outline" size="lg">
                                    <Link href={`/${locale}/contact`}>Book a Demo</Link>
                                </Button>
                            </div>
                        </div>

                        <div className="mt-12 grid gap-4 rounded-2xl border bg-background/80 p-6 sm:grid-cols-3">
                            <div>
                                <p className="text-3xl font-semibold">30 days</p>
                                <p className="text-muted-foreground text-sm">Rolling prepaid delivery window</p>
                            </div>
                            <div>
                                <p className="text-3xl font-semibold">Tiered CPL</p>
                                <p className="text-muted-foreground text-sm">Price changes by quantity and lead type</p>
                            </div>
                            <div>
                                <p className="text-3xl font-semibold">Auto routing</p>
                                <p className="text-muted-foreground text-sm">Continuous distribution with pace tracking</p>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </>
    )
}
