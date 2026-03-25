import { useEffect, useState } from "react"

import type {
  Carrier,
  CreateTicketMessage,
  CreateTicketResponse,
  ResolveTicketsMessage,
  ResolveTicketsResponse
} from "~types"

import "./popup.css"

const RT_BASE = "https://rt.its.cit.cmu.edu"
const RT_LIST_URL = `${RT_BASE}/rt/Search/Results.html`
const RT_LIST_NEW =
  `${RT_LIST_URL}?Query=${encodeURIComponent("Queue = 'receiving' AND Status = 'new'")}` +
  `&OrderBy=Created&Order=DESC&RowsPerPage=0`
const RT_LIST_OPEN =
  `${RT_LIST_URL}?Query=${encodeURIComponent("Queue = 'receiving' AND Status = 'open'")}` +
  `&OrderBy=Created&Order=DESC&RowsPerPage=0`

const CARRIERS: Carrier[] = ["FedEx", "UPS", "Amazon", "USPS"]

type PageMode = "loading" | "new-list" | "open-list" | "other"

function IndexPopup() {
  const [pageMode, setPageMode] = useState<PageMode>("loading")
  const [recipientName, setRecipientName] = useState("")
  const [carrier, setCarrier] = useState<Carrier>("FedEx")
  const [vendor, setVendor] = useState("")
  const [quantity, setQuantity] = useState(1)

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url ?? ""
      const decoded = decodeURIComponent(url)
      if (!url.startsWith(RT_LIST_URL) || !decoded.includes("receiving")) {
        setPageMode("other")
        return
      }
      if (decoded.includes("Status = 'open'")) {
        setPageMode("open-list")
      } else {
        setPageMode("new-list")
      }
    })
  }, [])

  const navigateTab = (url: string, onComplete: () => void) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.id) return
      const tabId = tabs[0].id
      chrome.tabs.update(tabId, { url })
      chrome.tabs.onUpdated.addListener(function listener(id, info) {
        if (id === tabId && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener)
          onComplete()
        }
      })
    })
  }

  const handleStartNew = () => {
    navigateTab(RT_LIST_NEW, () => setPageMode("new-list"))
  }

  const handleResolve = () => {
    navigateTab(RT_LIST_OPEN, () => setPageMode("open-list"))
  }

  const [status, setStatus] = useState<"idle" | "working" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  const getActiveTabId = async (): Promise<number> => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const tabId = tabs[0]?.id
    if (!tabId) throw new Error("No active tab found")
    return tabId
  }

  const handleSubmit = async () => {
    if (!recipientName.trim()) return

    setStatus("working")
    setErrorMsg("")

    const message: CreateTicketMessage = {
      type: "CREATE_TICKET",
      payload: { recipientName: recipientName.trim(), carrier, vendor: vendor.trim(), quantity }
    }

    try {
      const tabId = await getActiveTabId()
      const response: CreateTicketResponse = await chrome.tabs.sendMessage(tabId, message)

      if (!response.success) {
        setStatus("error")
        setErrorMsg(response.error ?? "Unknown error")
        return
      }

      setStatus("idle")
    } catch (err) {
      setStatus("error")
      setErrorMsg(err instanceof Error ? err.message : "Failed to reach content script")
    }
  }

  const handleResolveSubmit = async () => {
    if (!recipientName.trim()) return

    setStatus("working")
    setErrorMsg("")

    const message: ResolveTicketsMessage = {
      type: "RESOLVE_TICKETS",
      recipientName: recipientName.trim()
    }

    try {
      const tabId = await getActiveTabId()
      const response: ResolveTicketsResponse = await chrome.tabs.sendMessage(tabId, message)

      if (!response.success) {
        setStatus("error")
        setErrorMsg(response.error ?? "Unknown error")
        return
      }

      setStatus("idle")
    } catch (err) {
      setStatus("error")
      setErrorMsg(err instanceof Error ? err.message : "Failed to reach content script")
    }
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || status === "working") return
      if (pageMode === "new-list" && recipientName.trim()) {
        handleSubmit()
      } else if (pageMode === "open-list" && recipientName.trim()) {
        handleResolveSubmit()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [pageMode, recipientName, status, carrier, vendor, quantity])

  const header = (
    <div className="header">
      <span className="header-dot" />
      <h1 className="title">ECE Receiving</h1>
    </div>
  )

  if (pageMode === "loading") {
    return (
      <div className="popup">
        {header}
        <div className="body">
          <div className="loading">Loading…</div>
        </div>
      </div>
    )
  }

  if (pageMode === "other") {
    return (
      <div className="popup">
        {header}
        <div className="body">
          <p className="subtitle">
            Navigate to the RT ticket queue to get started.
          </p>
          <div className="btn-group">
            <button className="btn btn-primary full-width" onClick={handleStartNew}>
              Start New
            </button>
            <button className="btn btn-secondary full-width" onClick={handleResolve}>
              Resolve Ticket
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (pageMode === "open-list") {
    return (
      <div className="popup">
        {header}
        <div className="body">
          <div className="field">
            <label htmlFor="recipient">Recipient Name</label>
            <input
              id="recipient"
              type="text"
              placeholder="e.g. John Smith"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              autoFocus
            />
          </div>

          {status === "error" && <p className="error-msg">{errorMsg}</p>}

          <div className="btn-group">
            <button
              className="btn btn-secondary full-width"
              onClick={handleResolveSubmit}
              disabled={!recipientName.trim() || status === "working"}>
              {status === "working" ? "Resolving…" : "Resolve Ticket(s)"}
            </button>
            <button className="btn btn-primary full-width" onClick={handleStartNew}>
              Start New
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="popup">
      {header}
      <div className="body">
        <div className="field">
          <label htmlFor="recipient">Recipient Name</label>
          <input
            id="recipient"
            type="text"
            placeholder="e.g. John Smith"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="field">
          <label>Carrier</label>
          <div className="carrier-group">
            {CARRIERS.map((c) => (
              <label
                key={c}
                className={`carrier-option${carrier === c ? " selected" : ""}`}>
                <input
                  type="radio"
                  name="carrier"
                  value={c}
                  checked={carrier === c}
                  onChange={() => setCarrier(c)}
                />
                {c}
              </label>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="vendor">Vendor</label>
          <input
            id="vendor"
            type="text"
            placeholder="e.g. DigiKey, Dell"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="quantity">Quantity</label>
          <input
            id="quantity"
            type="number"
            min={1}
            value={quantity}
            onChange={(e) =>
              setQuantity(Math.max(1, parseInt(e.target.value) || 1))
            }
          />
        </div>

        {status === "error" && <p className="error-msg">{errorMsg}</p>}

        <div className="btn-group">
          <button
            className="btn btn-primary full-width"
            onClick={handleSubmit}
            disabled={!recipientName.trim() || status === "working"}>
            {status === "working" ? "Working…" : "Create Ticket"}
          </button>
          <button className="btn btn-secondary full-width" onClick={handleResolve}>
            Resolve Ticket
          </button>
        </div>
      </div>
    </div>
  )
}

export default IndexPopup
