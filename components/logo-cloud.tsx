export default function LogoCloud() {
    const stack = ['Next.js', 'Supabase', 'Stripe', 'Tailwind CSS', 'RTK Query', 'PostgreSQL', 'Vercel', 'Zod', 'Shadcn UI', 'TypeScript']

    return (
        <section className="bg-background py-16">
            <div className="mx-auto max-w-5xl px-6">
                <h2 className="text-center text-lg font-medium">Built with modern tools trusted by fast-moving teams.</h2>
                <div className="mx-auto mt-12 flex max-w-4xl flex-wrap items-center justify-center gap-3">
                    {stack.map((item) => (
                        <span key={item} className="rounded-full border border-border/70 bg-muted/40 px-4 py-1.5 text-sm text-muted-foreground">
                            {item}
                        </span>
                    ))}
                </div>
            </div>
        </section>
    )
}
