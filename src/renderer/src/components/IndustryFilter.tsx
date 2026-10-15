import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, ChevronDown, SlidersHorizontal } from 'lucide-react'

type IndustryOption = { value: string; count: number }
type IndustryFilterProps = {
  options: IndustryOption[]
  value: string
  onChange: (value: string) => void
}

export default function IndustryFilter({
  options,
  value,
  onChange
}: IndustryFilterProps): ReactNode {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const items = useRef<(HTMLButtonElement | null)[]>([])
  const initialIndex = useRef(0)
  const menuId = useId()
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  )
  const selected = options[selectedIndex]

  useEffect(() => {
    if (!open) return
    items.current[initialIndex.current]?.focus()
    const closeOutside = (event: PointerEvent): void => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  const openMenu = (index: number): void => {
    initialIndex.current = index
    setOpen(true)
  }

  const handleMenuKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    const index = items.current.findIndex((item) => item === document.activeElement)
    let nextIndex: number
    switch (event.key) {
      case 'ArrowDown':
        nextIndex = (index + 1) % options.length
        break
      case 'ArrowUp':
        nextIndex = (index - 1 + options.length) % options.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = options.length - 1
        break
      case 'Escape':
        event.preventDefault()
        setOpen(false)
        trigger.current?.focus()
        return
      default:
        return
    }
    event.preventDefault()
    items.current[nextIndex]?.focus()
  }

  return (
    <div
      className="industry-filter"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <button
        ref={trigger}
        type="button"
        className={`industry-filter-trigger${value !== options[0]?.value ? ' is-filtered' : ''}`}
        aria-label={`按行业筛选：${selected?.value}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? setOpen(false) : openMenu(selectedIndex))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            openMenu(event.key === 'ArrowUp' ? options.length - 1 : selectedIndex)
          }
        }}
      >
        <SlidersHorizontal size={15} />
        <span className="industry-filter-value">{selected?.value}</span>
        <span className="industry-filter-count">{selected?.count ?? 0}</span>
        <ChevronDown size={14} className="industry-filter-chevron" />
      </button>
      {open && (
        <div className="industry-filter-popover">
          <div className="industry-filter-heading">
            <span>行业筛选</span>
            <span>{Math.max(0, options.length - 1)} 个分类</span>
          </div>
          <div id={menuId} role="menu" aria-label="行业筛选" onKeyDown={handleMenuKey}>
            {options.map((option, index) => (
              <button
                key={option.value}
                ref={(element) => {
                  items.current[index] = element
                }}
                type="button"
                role="menuitemradio"
                aria-checked={option.value === value}
                tabIndex={-1}
                className="industry-filter-option"
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                  trigger.current?.focus()
                }}
              >
                <span className="industry-filter-check">
                  {option.value === value && <Check size={14} />}
                </span>
                <span className="industry-filter-option-label">{option.value}</span>
                <span className="industry-filter-count">{option.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
