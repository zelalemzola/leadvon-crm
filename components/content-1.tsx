import Image from 'next/image'

export default function ContentSection() {
    return (
        <section className="py-16 md:py-32">
            <div className="mx-auto max-w-5xl space-y-8 px-6 md:space-y-16">
                <h2 id="about" className="relative z-10 max-w-xl text-4xl font-medium lg:text-5xl">About LeadVon</h2>
                <div className="grid gap-6 sm:grid-cols-2 md:gap-12 lg:gap-24">
                    <div className="relative mb-6 sm:mb-0">
                        <div className="bg-linear-to-b aspect-76/59 relative rounded-2xl from-zinc-300 to-transparent p-px dark:from-zinc-700">
                            <Image
                                src="/payments.png"
                                className="hidden rounded-[15px] dark:block"
                                alt="payments illustration dark"
                                width={1207}
                                height={929}
                            />
                            <Image
                                src="/payments-light.png"
                                className="rounded-[15px] shadow dark:hidden"
                                alt="payments illustration light"
                                width={1207}
                                height={929}
                            />
                        </div>
                    </div>

                    <div className="relative space-y-4">
                        <p className="text-muted-foreground">
                            LeadVon was built to solve one hard problem: how to deliver paid leads consistently without billing confusion.
                        </p>
                        <p className="text-muted-foreground">
                            We focus on transparent monthly pricing, prepaid-first delivery, and operational visibility for both admins and client teams.
                        </p>

                        <div className="pt-6">
                            <blockquote className="border-l-4 pl-4">
                                <p>“LeadVon gave us a clear process from payment to delivery. We now spend less time on manual follow-up and more time closing business.”</p>

                                <div className="mt-6 space-y-3">
                                    <cite className="block font-medium">Operations Lead, Insurance Brokerage</cite>
                                    <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
                                        Verified LeadVon customer
                                    </span>
                                </div>
                            </blockquote>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
