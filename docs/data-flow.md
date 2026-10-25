# Data flow

## Collecting

```mermaid
sequenceDiagram
    participant Page as Page
    participant Probe as page-probe.js
    participant Net as webRequest
    participant RC as request-collector.js
    participant TS as tab-store.js
    participant IDT as id-tracker.js
    participant BD as badge-updater.js

    Page->>Net: top-level navigation
    Net->>RC: onBeforeRequest (type main_frame)
    RC->>TS: reset(tabId, pageUrl)
    Probe->>TS: page profile (URL, title, screen, language, time zone, user agent)
    loop every request of the page
        Page->>Net: request
        Net->>RC: onBeforeRequest
        alt thirdParty and tabId >= 0
            RC->>TS: add request (url, method, type, parameters, time)
            RC->>IDT: observe hashed ID candidates of the parameters
            Net->>RC: onSendHeaders
            RC->>TS: attach headers (cookie names and hashes, Referer, Origin)
            RC->>IDT: observe hashed ID candidates of the cookies
            TS->>BD: recipient count changed
            BD->>BD: setBadgeText(tabId)
        end
    end
```

- The page profile can arrive after the first requests. That is fine, because evaluation only happens when the popup opens.
- A profile from a tab without a record (e.g. a page that was already open when the extension was installed) starts a new record from the profile URL.
- ID candidates are recorded while collecting, so sightings on sites where the popup was never opened still count.
- Requests and headers are joined by `requestId`.
- `tabs.onRemoved` deletes the tab entry. A new top-level navigation in the same tab resets it.

## Showing

```mermaid
sequenceDiagram
    participant User
    participant Popup as popup-app.js
    participant DET as detector.js
    participant TS as tab-store.js
    participant IDT as id-tracker.js
    participant CR as company-resolver.js
    participant CK as cookie-reader.js

    User->>Popup: click toolbar icon
    Popup->>Popup: active tab, host permission check
    alt internal page or no permission
        Popup->>Popup: unavailable view
    else
        Popup->>DET: getReport(tabId)
        DET->>TS: profile + requests
        DET->>CR: group hosts into recipients
        loop each recipient
            DET->>DET: match profile values in URL, body, headers
            DET->>IDT: lookup hashed ID candidates
            IDT-->>DET: number of other sites
            DET->>CK: cookies of the recipient's domains
            CK-->>DET: cookies with decoded parts
        end
        DET-->>Popup: report
        alt no recipients
            Popup->>Popup: empty view
        else
            Popup->>Popup: overview view
        end
    end
```

## Navigation in the popup

```mermaid
stateDiagram-v2
    [*] --> Overview
    [*] --> Empty
    [*] --> Unavailable
    Overview --> Recipient: select company
    Recipient --> Overview: back
    Recipient --> Technical: technical details
    Technical --> Recipient: back
    state Technical {
        [*] --> Requests
        Requests --> Cookies: tab
        Cookies --> Requests: tab
    }
```