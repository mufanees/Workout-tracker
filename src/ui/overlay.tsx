import { signal } from '@preact/signals'
import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { SheetJelly } from './Goo'
import { Icon } from './icons'

// ---- Bottom sheet -----------------------------------------------------------

export function Sheet({
  open,
  onClose,
  title,
  children,
  full,
  footer,
  label,
}: {
  open: boolean
  onClose: () => void
  title?: ComponentChildren
  children: ComponentChildren
  full?: boolean
  footer?: ComponentChildren
  label?: string
}) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (open) {
      setMounted(true)
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      return () => cancelAnimationFrame(r)
    }
    setShown(false)
    const t = setTimeout(() => setMounted(false), 260)
    return () => clearTimeout(t)
  }, [open])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.classList.add('locked')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('locked')
    }
  }, [open])
  if (!mounted) return null
  return (
    <div class={'sheet-root' + (shown ? ' shown' : '')}>
      <div class="sheet-backdrop" onClick={onClose} />
      <div class={'sheet' + (full ? ' full' : '')} role="dialog" aria-modal="true" aria-label={label || (typeof title === 'string' ? title : undefined)}>
        <SheetJelly go={shown} />
        <div class="sheet-grip" aria-hidden="true" />
        {title != null && (
          <div class="sheet-head">
            <h2>{title}</h2>
            <button class="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="x" />
            </button>
          </div>
        )}
        <div class="sheet-body">{children}</div>
        {footer && <div class="sheet-foot">{footer}</div>}
      </div>
    </div>
  )
}

// ---- Global dialogs (confirm + action sheet) --------------------------------

export interface Action {
  label: string
  icon?: string
  danger?: boolean
  hint?: string
  selected?: boolean
  onSelect: () => void
}

type Dialog =
  | { kind: 'actions'; title?: string; message?: string; actions: Action[] }
  | { kind: 'confirm'; title: string; message?: string; confirm: string; cancel: string; danger?: boolean; resolve: (ok: boolean) => void }

const dialog = signal<Dialog | null>(null)
const dialogOpen = signal(false)

export function actionSheet(opts: { title?: string; message?: string; actions: Action[] }) {
  dialog.value = { kind: 'actions', ...opts }
  dialogOpen.value = true
}

export function confirmDialog(opts: { title: string; message?: string; confirm?: string; cancel?: string; danger?: boolean }) {
  return new Promise<boolean>((resolve) => {
    dialog.value = { kind: 'confirm', confirm: 'OK', cancel: 'Cancel', ...opts, resolve }
    dialogOpen.value = true
  })
}

function closeDialog(ok = false) {
  const d = dialog.value
  if (d?.kind === 'confirm') d.resolve(ok)
  dialogOpen.value = false
  // Unmount once the exit animation is done, so nothing invisible is left over the screen.
  setTimeout(() => {
    if (!dialogOpen.value && dialog.value === d) dialog.value = null
  }, 320)
}

function DialogHost() {
  const d = dialog.value
  if (!d) return null
  if (d.kind === 'actions') {
    return (
      <Sheet open={dialogOpen.value} onClose={() => closeDialog()} label={d.title || 'Options'}>
        {(d.title || d.message) && (
          <div class="action-head">
            {d.title && <div class="action-title">{d.title}</div>}
            {d.message && <div class="action-msg">{d.message}</div>}
          </div>
        )}
        <div class="action-list">
          {d.actions.map((a) => (
            <button
              class={'action' + (a.danger ? ' danger' : '') + (a.selected ? ' selected' : '')}
              onClick={() => {
                closeDialog()
                a.onSelect()
              }}
            >
              {a.icon && <Icon name={a.icon} />}
              <span class="action-label">{a.label}</span>
              {a.hint && <span class="action-hint">{a.hint}</span>}
              {a.selected && <Icon name="check" class="action-check" />}
            </button>
          ))}
        </div>
        <button class="btn btn-quiet btn-block" onClick={() => closeDialog()}>
          Cancel
        </button>
      </Sheet>
    )
  }
  return (
    <div class={'modal-root' + (dialogOpen.value ? ' shown' : '')}>
      <div class="sheet-backdrop" onClick={() => closeDialog(false)} />
      <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">{d.title}</h2>
        {d.message && <p>{d.message}</p>}
        <div class="modal-actions">
          <button class="btn btn-quiet" onClick={() => closeDialog(false)}>
            {d.cancel}
          </button>
          <button class={'btn ' + (d.danger ? 'btn-danger' : 'btn-primary')} onClick={() => closeDialog(true)} autoFocus>
            {d.confirm}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Toasts -----------------------------------------------------------------

interface ToastMsg {
  id: number
  text: string
  action?: { label: string; run: () => void }
}
const toastMsg = signal<ToastMsg | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null

export function toast(text: string, action?: { label: string; run: () => void }) {
  if (toastTimer) clearTimeout(toastTimer)
  toastMsg.value = { id: Date.now(), text, action }
  toastTimer = setTimeout(() => (toastMsg.value = null), action ? 5000 : 2400)
}

function ToastHost() {
  const t = toastMsg.value
  return (
    <div class="toast-wrap" aria-live="polite">
      {t && (
        <div class="toast" key={t.id}>
          <span>{t.text}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.run()
                toastMsg.value = null
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function OverlayHost() {
  return (
    <>
      <DialogHost />
      <ToastHost />
    </>
  )
}

// ---- Auto-growing textarea --------------------------------------------------

export function AutoText(props: { value: string; onInput: (v: string) => void; placeholder?: string; class?: string; autoFocus?: boolean; label?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  // Grow with the text, but never shorter than the empty box with its placeholder,
  // so typing the first words doesn't make the field jump.
  const minH = useRef(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    if (!props.value) minH.current = el.scrollHeight
    el.style.height = Math.max(el.scrollHeight, minH.current) + 'px'
  }, [props.value, props.placeholder])
  useEffect(() => {
    if (props.autoFocus) ref.current?.focus()
  }, [])
  return (
    <textarea
      ref={ref}
      rows={1}
      class={'autotext ' + (props.class || '')}
      value={props.value}
      placeholder={props.placeholder}
      aria-label={props.label || props.placeholder}
      onInput={(e) => props.onInput((e.target as HTMLTextAreaElement).value)}
    />
  )
}
