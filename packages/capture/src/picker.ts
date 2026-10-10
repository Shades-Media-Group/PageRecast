/**
 * Element picker drawn into the page. Hovering outlines an element; a click
 * marks it with `data-pagerecast-target` and resolves. Escape cancels.
 * Arrow up / down walk to the parent / first child of the highlighted element.
 */
export function pickElement(doc: Document): Promise<boolean> {
  const win = doc.defaultView!
  return new Promise((resolve) => {
    const host = doc.createElement('pagerecast-picker')
    const shadow = host.attachShadow({ mode: 'closed' })
    shadow.innerHTML = `<style>
      .box{position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #F9000A;background:rgba(249,0,10,.08);border-radius:2px;transition:all 60ms linear}
      .tag{position:fixed;pointer-events:none;z-index:2147483647;font:600 11px/1 system-ui,sans-serif;color:#FDFDFC;background:#0A0A0B;padding:5px 7px;border-radius:5px;white-space:nowrap}
      .tag b{color:#FF8299;font-weight:600}
    </style><div class="box"></div><div class="tag"></div>`
    doc.documentElement.appendChild(host)
    const box = shadow.querySelector<HTMLElement>('.box')!
    const tag = shadow.querySelector<HTMLElement>('.tag')!
    let current: Element | null = null

    const show = (el: Element) => {
      current = el
      const r = el.getBoundingClientRect()
      Object.assign(box.style, {
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      })
      tag.innerHTML = `${el.localName}<b> ${Math.round(r.width)} × ${Math.round(r.height)}</b>`
      tag.style.left = `${Math.max(4, r.left)}px`
      tag.style.top = `${r.top > 28 ? r.top - 24 : r.bottom + 6}px`
    }
    const onMove = (e: MouseEvent) => {
      const el = doc.elementFromPoint(e.clientX, e.clientY)
      if (el && el !== host && el !== current) show(el)
    }
    const finish = (picked: boolean) => {
      win.removeEventListener('mousemove', onMove, true)
      win.removeEventListener('click', onClick, true)
      win.removeEventListener('keydown', onKey, true)
      host.remove()
      resolve(picked)
    }
    const onClick = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!current) return
      doc.querySelector('[data-pagerecast-target]')?.removeAttribute('data-pagerecast-target')
      current.setAttribute('data-pagerecast-target', '')
      finish(true)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false)
      else if (e.key === 'ArrowUp' && current?.parentElement) show(current.parentElement)
      else if (e.key === 'ArrowDown' && current?.firstElementChild) show(current.firstElementChild)
      else if (e.key === 'Enter' && current) onClick(new MouseEvent('click'))
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    win.addEventListener('mousemove', onMove, true)
    win.addEventListener('click', onClick, true)
    win.addEventListener('keydown', onKey, true)
  })
}
