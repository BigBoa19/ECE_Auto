import type { LookupEmailResponse, MessageToBackground } from "~types"

chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" })

const DIRECTORY_URL = "https://directory.andrew.cmu.edu/index.cgi"
const EMAIL_REGEX = /<b>Email:<\/b>\s*([a-zA-Z0-9._%+-]+@andrew\.cmu\.edu)/i

async function lookupEmail(name: string): Promise<LookupEmailResponse> {
  const url = `${DIRECTORY_URL}?action=search&searchtype=basic&search=${encodeURIComponent(name)}`

  const res = await fetch(url)
  if (!res.ok) {
    return { success: false, error: `Directory returned HTTP ${res.status}` }
  }

  const html = await res.text()
  const match = html.match(EMAIL_REGEX)

  if (!match) {
    return { success: false, error: `No CMU email found for "${name}"` }
  }

  return { success: true, email: match[1] }
}

chrome.runtime.onMessage.addListener(
  (message: MessageToBackground, _sender, sendResponse: (r: LookupEmailResponse) => void) => {
    if (message.type === "LOOKUP_EMAIL") {
      lookupEmail(message.name).then(sendResponse)
      return true
    }
  }
)

export {}
