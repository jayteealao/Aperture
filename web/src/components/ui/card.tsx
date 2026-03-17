import type { HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/utils/cn'

const cardVariants = cva('rounded-xl border transition-all duration-200', {
  variants: {
    variant: {
      default: 'bg-card border-border',
      glass: 'glass',
      outline: 'border-border bg-transparent',
    },
    padding: {
      none: '',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-6',
    },
  },
  defaultVariants: { variant: 'default', padding: 'md' },
})

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  hover?: boolean
}

export function Card({
  className,
  variant,
  padding,
  hover = false,
  ...props
}: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(
        cardVariants({ variant, padding }),
        hover && 'hover:border-ring hover:bg-secondary-hover cursor-pointer',
        className
      )}
      {...props}
    />
  )
}

// Children-based header — callers compose CardTitle / CardDescription / action elements.
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-col gap-1', className)}
      {...props}
    />
  )
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      data-slot="card-title"
      className={cn('font-semibold text-foreground leading-snug', className)}
      {...props}
    />
  )
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="card-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-content"
      className={cn('mt-4', className)}
      {...props}
    />
  )
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('mt-4 pt-4 border-t border-border flex items-center gap-3', className)}
      {...props}
    />
  )
}
