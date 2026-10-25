# Data flow

## Collecting

```mermaid
sequenceDiagram
    participant Page as Page
    participant Net as webRequest
    participant Tabs as tabs.onUpdated
    participant RC as request-collector.js
    participant TS as tab-store.js
    participant IDT as id-tracker.js
    participant BD as badge-updater.js

    Page->>Net: top-level navigation
    Net->>RC: onBeforeRequest (type main_frame)
    RC->>TS: reset(tabId, pageUrl)
    Page->>Tabs: URL change without top-level request (back/forward cache, same-document navigation)
    Tabs->>TS: reset when the URL differs from the record, ignoring the fragment
    loop every request of the page
        Page->>Net: request
        Net->>RC: onBeforeRequest
        alt thirdParty and tabId >= 0
            RC->>TS: add request under the URL of its top-level document
            TS->>TS: drop when that URL belongs to another site than the record
            RC->>RC: hash ID candidates of the parameters (key=value)
            RC->>TS: attach identifier hashes to the request
            RC->>IDT: observe identifier hashes for the site of the top-level document (not in private tabs)
            Net->>RC: onSendHeaders
            RC->>TS: attach headers to the hop with the same requestId and URL (cookie names and hashes, Referer, Origin)
            RC->>IDT: observe identifier hashes of the cookies (not in private tabs)
            TS->>BD: recipient count changed
            BD->>BD: setBadgeText(tabId)
        end
    end
```

- A request without a tab record (e.g. on a page that was already open when the extension was installed) starts a new record from the URL of its top-level document.
- Requests that arrive after a navigation but were sent by the previous page (e.g. beacons on unload) carry the previous page as their top-level document. They are not added to the new record, but their ID sightings count for the previous site.
- ID candidates are recorded while collecting, so sightings on sites where the popup was never opened still count.
- Requests and headers are joined by `requestId` and URL, because redirects keep the `requestId`.
- A tab keeps the newest 500 requests.
- `tabs.onRemoved` deletes the tab entry.
- `runtime.onSuspend` writes pending tab records and ID sightings before the event page is suspended.

## Showing

```mermaid
sequenceDiagram
    participant User
    participant Popup as popup-app.js
    participant DET as detector.js
    participant TS as tab-store.js
    participant CS as page-probe.js
    participant IDT as id-tracker.js
    participant CR as company-resolver.js
    participant CK as cookie-reader.js

    User->>Popup: click toolbar icon
    Popup->>Popup: active tab, host permission check
    alt internal page or no permission
        Popup->>Popup: unavailable view
    else
        Popup->>DET: getReport(tabId)
        DET->>TS: page URL + requests
        DET->>CS: getProfile (title, screen, language, time zone)
        CS-->>DET: profile, or nothing without content script
        DET->>CR: group hosts into recipients
        par each recipient
            DET->>DET: match profile values in URL, body, headers
            DET->>IDT: lookup identifier hashes
            IDT-->>DET: number of other sites
            DET->>CK: cookies of the recipient's domains that were sent
            CK-->>DET: cookies with decoded parts
        end
        DET-->>Popup: report
        alt report missing or failed
            Popup->>Popup: unavailable view
        else no recipients
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
        Requests --> Cookies: tab, arrow key
        Cookies --> Requests: tab, arrow key
    }
```