export type Carrier = "FedEx" | "UPS" | "Amazon" | "USPS"

export interface TicketPayload {
  recipientName: string
  carrier: Carrier
  vendor: string
  quantity: number
}

// Popup → Content Script
export interface CreateTicketMessage {
  type: "CREATE_TICKET"
  payload: TicketPayload
}

// Content Script → Background
export interface LookupEmailMessage {
  type: "LOOKUP_EMAIL"
  name: string
}

export type MessageToContent = CreateTicketMessage
export type MessageToBackground = LookupEmailMessage

export interface LookupEmailResponse {
  success: boolean
  email?: string
  error?: string
}

export interface CreateTicketResponse {
  success: boolean
  error?: string
}

export interface PendingTicket {
  recipientName: string
  carrier: Carrier
  vendor: string
  quantity: number
  email: string
}
