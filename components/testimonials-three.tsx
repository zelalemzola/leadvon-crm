import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Star } from 'lucide-react'

export default function TestimonialSection() {
    const testimonials = [
        {
            name: 'Sophie Martin',
            role: 'Agency Owner',
            stars: 5,
            avatar: 'https://i.pravatar.cc/100?img=47',
            content: "LeadVon helped us move from ad-hoc lead distribution to a clean monthly workflow our team can trust.",
        },
        {
            name: 'Michael Lee',
            role: 'Sales Manager',
            stars: 4,
            avatar: 'https://i.pravatar.cc/100?img=12',
            content: 'The prepaid model made billing conversations simple. We always know where budget stands before delivery.',
        },
        {
            name: 'Nadia Rahman',
            role: 'Client Operations',
            stars: 5,
            avatar: 'https://i.pravatar.cc/100?img=32',
            content: 'Our agents receive leads faster, and our admins can finally monitor pace and commitments from one place.',
        },
    ]

    return (
        <section>
            <div className="py-24">
                <div className="@container mx-auto w-full max-w-5xl px-6">
                    <div className="@lg:grid-cols-2 @3xl:grid-cols-3 @3xl:gap-12 grid gap-6">
                        {testimonials.map((testimonial, index) => (
                            <div key={index}>
                                <div className="flex gap-1">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <Star
                                            key={i}
                                            className={cn('size-4', i < testimonial.stars ? 'fill-primary stroke-primary' : 'fill-foreground/15 stroke-transparent')}
                                        />
                                    ))}
                                </div>
                                <p className="text-foreground my-4">{testimonial.content}</p>
                                <div className="flex items-center gap-2">
                                    <Avatar className="ring-foreground/10 size-6 border border-transparent shadow ring-1">
                                        <AvatarImage
                                            src={testimonial.avatar}
                                            alt={testimonial.name}
                                        />
                                        <AvatarFallback>{testimonial.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div className="text-foreground text-sm font-medium">{testimonial.name}</div>
                                    <span
                                        aria-hidden
                                        className="bg-foreground/25 size-1 rounded-full"></span>
                                    <span className="text-muted-foreground text-sm">{testimonial.role}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}
