import { useEffect, useState } from "react"

import type { Carrier, CreateTicketMessage, CreateTicketResponse } from "~types"

import "./popup.css"

const RT_BASE = "https://rt.its.cit.cmu.edu"
const RT_LIST_URL = `${RT_BASE}/rt/Search/Results.html`
const RT_LIST_FULL =
  `${RT_LIST_URL}?Query=${encodeURIComponent("Queue = 'receiving' AND Status = 'new'")}` +
  `&OrderBy=Created&Order=DESC&RowsPerPage=0`

const CARRIERS: Carrier[] = ["FedEx", "UPS", "Amazon", "USPS"]

function IndexPopup() {
  const [onCorrectPage, setOnCorrectPage] = useState<boolean | null>(null)
  const [recipientName, setRecipientName] = useState("")
  const [carrier, setCarrier] = useState<Carrier>("FedEx")
  const [vendor, setVendor] = useState("")
  const [quantity, setQuantity] = useState(1)

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url ?? ""
      const isOnListPage =
        url.startsWith(RT_LIST_URL) &&
        decodeURIComponent(url).includes("receiving")
      setOnCorrectPage(isOnListPage)
    })
  }, [])

  const handleStartNew = () => {
    chrome.tabs.create({ url: RT_LIST_FULL }, (tab) => {
      if (!tab?.id) return
      const tabId = tab.id
      chrome.tabs.onUpdated.addListener(function listener(id, info) {
        if (id === tabId && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener)
          setOnCorrectPage(true)
        }
      })
    })
  }

  const [status, setStatus] = useState<"idle" | "working" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  const handleSubmit = async () => {
    if (!recipientName.trim()) return

    setStatus("working")
    setErrorMsg("")

    const message: CreateTicketMessage = {
      type: "CREATE_TICKET",
      payload: { recipientName: recipientName.trim(), carrier, vendor: vendor.trim(), quantity }
    }

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
      const tabId = tabs[0]?.id
      if (!tabId) throw new Error("No active tab found")

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

  const header = (
    <div className="header">
      <span className="header-dot" />
      <h1 className="title">ECE Receiving</h1>
    </div>
  )

  if (onCorrectPage === null) {
    return (
      <div className="popup">
        {header}
        <div className="body">
          <div className="loading">Loading…</div>
        </div>
      </div>
    )
  }

  if (!onCorrectPage) {
    return (
      <div className="popup">
        {header}
        <div className="body">
          <p className="subtitle">
            Navigate to the RT ticket queue to get started.
          </p>
          <button className="btn btn-primary full-width" onClick={handleStartNew}>
            Start New
          </button>
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

        <button
          className="btn btn-primary full-width"
          onClick={handleSubmit}
          disabled={!recipientName.trim() || status === "working"}>
          {status === "working" ? "Working…" : "Create Ticket"}
        </button>
      </div>
    </div>
  )
}

export default IndexPopup
