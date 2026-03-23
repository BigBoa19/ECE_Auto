import type { PlasmoCSConfig } from "plasmo"

import type {
  CreateTicketResponse,
  LookupEmailResponse,
  MessageToContent,
  PendingTicket,
  ResolveTicketsResponse,
  TicketPayload
} from "~types"

export const config: PlasmoCSConfig = {
  matches: ["https://rt.its.cit.cmu.edu/*"]
}

const RT_BASE = "https://rt.its.cit.cmu.edu"
const RT_CREATE_URL = `${RT_BASE}/rt/Ticket/Create.html`
const RT_DISPLAY_URL = `${RT_BASE}/rt/Ticket/Display.html`
const RT_MODIFY_ALL_URL = `${RT_BASE}/rt/Ticket/ModifyAll.html`

type PageType = "create" | "display" | "jumbo" | "other"

function getCurrentPage(): PageType {
  const href = window.location.href
  if (href.startsWith(RT_CREATE_URL)) return "create"
  if (href.startsWith(RT_DISPLAY_URL)) return "display"
  if (href.startsWith(RT_MODIFY_ALL_URL)) return "jumbo"
  return "other"
}

// --------------- Shared helpers ---------------

const FIELD_IDS = {
  recipient: "Object-RT::Ticket--CustomField-1-Value",
  vendor:    "Object-RT::Ticket--CustomField-2-Value",
  carrier:   "Object-RT::Ticket--CustomField-3-Value",
  quantity:  "Object-RT::Ticket--CustomField-4-Value"
} as const

function waitForElement<T extends HTMLElement = HTMLElement>(
  selector: string,
  timeoutMs = 5000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<T>(selector)
    if (existing) return resolve(existing)

    const observer = new MutationObserver(() => {
      const el = document.querySelector<T>(selector)
      if (el) {
        observer.disconnect()
        resolve(el)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })

    setTimeout(() => {
      observer.disconnect()
      reject(new Error(`Timed out waiting for ${selector}`))
    }, timeoutMs)
  })
}

function waitForElementById(id: string, timeoutMs = 5000): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id)
    if (existing) return resolve(existing)

    const observer = new MutationObserver(() => {
      const el = document.getElementById(id)
      if (el) {
        observer.disconnect()
        resolve(el)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })

    setTimeout(() => {
      observer.disconnect()
      reject(new Error(`Timed out waiting for #${id}`))
    }, timeoutMs)
  })
}

function setInputValue(el: HTMLInputElement, value: string): void {
  el.value = value
  el.dispatchEvent(new Event("input", { bubbles: true }))
  el.dispatchEvent(new Event("change", { bubbles: true }))
}

function setSelectValue(name: string, value: string): void {
  const select = document.querySelector<HTMLSelectElement>(`select[name="${name}"]`)
  if (!select) {
    console.error(`[content] Select not found: ${name}`)
    return
  }

  select.value = value
  select.dispatchEvent(new Event("change", { bubbles: true }))

  // Manually update the bootstrap-select display to match
  const container = select.closest(".bootstrap-select")
  if (container) {
    const displayEl = container.querySelector(".filter-option-inner-inner")
    const selectedOption = select.querySelector<HTMLOptionElement>(`option[value="${value}"]`)
    if (displayEl && selectedOption) {
      displayEl.textContent = selectedOption.textContent?.trim() ?? value
    }
  }
}

// --------------- Idempotency check (list page) ---------------

interface DuplicateResult {
  count: number
  link?: HTMLAnchorElement
}

function checkForDuplicate(name: string, carrier: string): DuplicateResult {
  const rows = document.querySelectorAll(
    "table.collection-as-table tbody tr, table.collection-as-table tr"
  )
  const lowerName = name.toLowerCase()
  const lowerCarrier = carrier.toLowerCase()
  const matches: Element[] = []

  for (const row of rows) {
    const text = row.textContent?.toLowerCase() ?? ""
    if (text.includes(lowerName) && text.includes(lowerCarrier)) {
      matches.push(row)
    }
  }

  if (matches.length === 0) return { count: 0 }
  if (matches.length === 1) {
    const link = matches[0].querySelector<HTMLAnchorElement>(
      'a[href*="/rt/Ticket/Display.html"]'
    )
    return { count: 1, link: link ?? undefined }
  }
  return { count: matches.length }
}

// --------------- Page handlers ---------------

async function handleCreatePage(pending: PendingTicket): Promise<void> {
  console.log("[content:create] Filling ticket form...")

  const [recipientEl, vendorEl, carrierEl, quantityEl] = await Promise.all([
    waitForElementById(FIELD_IDS.recipient),
    waitForElementById(FIELD_IDS.vendor),
    waitForElementById(FIELD_IDS.carrier),
    waitForElementById(FIELD_IDS.quantity)
  ]) as HTMLInputElement[]

  setInputValue(recipientEl, pending.recipientName)
  setInputValue(vendorEl, pending.vendor)
  setInputValue(carrierEl, pending.carrier)
  setInputValue(quantityEl, String(pending.quantity))
  console.log("[content:create] Fields filled, submitting form...")

  const submitBtn = document.querySelector<HTMLInputElement>(
    'input[name="SubmitTicket"]'
  )
  if (submitBtn) {
    submitBtn.click()
  } else {
    console.error("[content:create] Could not find submit button")
  }
}

async function handleDisplayPage(): Promise<void> {
  console.log("[content:display] Clicking Jumbo link...")

  const jumboLink = await waitForElement<HTMLAnchorElement>("#page-jumbo")
  jumboLink.click()
}

async function handleJumboPage(pending: PendingTicket): Promise<void> {
  console.log("[content:jumbo] Setting status and requestor email...")

  setSelectValue("Status", "open")
  setSelectValue("WatcherTypeEmail1", "Requestor")

  const emailInput = await waitForElement<HTMLInputElement>("#WatcherAddressEmail1")
  setInputValue(emailInput, pending.email)

  await chrome.storage.session.remove("pendingTicket")
  console.log("[content:jumbo] Auto-fill complete, submitting...")

  const saveBtn = document.querySelector<HTMLInputElement>(
    'input[name="SubmitTicket"][value="Save Changes"]'
  )
  if (saveBtn) {
    saveBtn.click()
  } else {
    console.error("[content:jumbo] Could not find Save Changes button")
  }
}

// --------------- Page load router ---------------

async function onPageLoad(): Promise<void> {
  const page = getCurrentPage()
  if (page === "other") return

  const result = await chrome.storage.session.get("pendingTicket")
  const pending = result.pendingTicket as PendingTicket | undefined
  if (!pending) return

  console.log(`[content:${page}] Pending ticket detected, handling...`)

  switch (page) {
    case "create":
      await handleCreatePage(pending)
      break
    case "display":
      await handleDisplayPage()
      break
    case "jumbo":
      await handleJumboPage(pending)
      break
  }
}

onPageLoad()

// --------------- Message listener (popup → content on list page) ---------------

async function handleCreateTicket(payload: TicketPayload): Promise<CreateTicketResponse> {
  console.log("[content] CREATE_TICKET received:", payload)

  const dupResult = checkForDuplicate(payload.recipientName, payload.carrier)

  if (dupResult.count > 1) {
    return {
      success: false,
      error: `Multiple tickets found for "${payload.recipientName}" (${dupResult.count} matches). Resolve manually.`
    }
  }

  const emailResponse: LookupEmailResponse = await chrome.runtime.sendMessage({
    type: "LOOKUP_EMAIL",
    name: payload.recipientName
  })

  console.log("[content] Email lookup response:", emailResponse)

  if (!emailResponse.success) {
    return { success: false, error: emailResponse.error ?? "Email lookup failed" }
  }

  const pending: PendingTicket = {
    recipientName: payload.recipientName,
    carrier: payload.carrier,
    vendor: payload.vendor,
    quantity: payload.quantity,
    email: emailResponse.email!
  }

  await chrome.storage.session.set({ pendingTicket: pending })

  if (dupResult.count === 1 && dupResult.link) {
    console.log("[content] Single duplicate found, navigating to existing ticket...")
    dupResult.link.click()
  } else {
    console.log("[content] No duplicates, navigating to create page...")
    window.location.href = RT_CREATE_URL
  }

  return { success: true }
}

async function handleResolveTickets(recipientName: string): Promise<ResolveTicketsResponse> {
  console.log("[content] RESOLVE_TICKETS received:", recipientName)

  const items = document.querySelectorAll("tbody.list-item")
  const lowerName = recipientName.toLowerCase()
  const matchingItems: Element[] = []

  for (const item of items) {
    const text = item.textContent?.toLowerCase() ?? ""
    if (text.includes(lowerName)) matchingItems.push(item)
  }

  if (matchingItems.length === 0) {
    return { success: false, error: `No open tickets found for "${recipientName}"` }
  }

  console.log(`[content] Resolving ${matchingItems.length} ticket(s) inline...`)

  for (let i = 0; i < matchingItems.length; i++) {
    const item = matchingItems[i]
    const statusSelect = item.querySelector<HTMLSelectElement>('select[name="Status"]')
    if (!statusSelect) {
      console.log(`[resolve ${i}] no Status select found, skipping`)
      continue
    }

    const td = statusSelect.closest<HTMLElement>("td")
    const editIcon = td?.querySelector<Element>(".value .edit-icon")
    console.log(`[resolve ${i}] editIcon found:`, !!editIcon)
    if (editIcon) editIcon.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await new Promise(r => setTimeout(r, 300))

    statusSelect.value = "resolved"
    statusSelect.dispatchEvent(new Event("change", { bubbles: true }))
    console.log(`[resolve ${i}] value set to:`, statusSelect.value)

    const bsContainer = statusSelect.closest(".bootstrap-select")
    if (bsContainer) {
      const displayEl = bsContainer.querySelector(".filter-option-inner-inner")
      if (displayEl) displayEl.textContent = "resolved"
    }

    const form = statusSelect.closest<HTMLFormElement>("form.editor")
    const submitBtn = form?.querySelector<Element>(".submit.text-success")
    console.log(`[resolve ${i}] submitBtn found:`, !!submitBtn)
    if (submitBtn) submitBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    await new Promise(r => setTimeout(r, 500))
  }

  return { success: true, count: matchingItems.length }
}

chrome.runtime.onMessage.addListener(
  (message: MessageToContent, _sender, sendResponse: (r: CreateTicketResponse | ResolveTicketsResponse) => void) => {
    if (message.type === "CREATE_TICKET") {
      handleCreateTicket(message.payload).then(sendResponse)
      return true
    }
    if (message.type === "RESOLVE_TICKETS") {
      handleResolveTickets(message.recipientName).then(sendResponse)
      return true
    }
  }
)
