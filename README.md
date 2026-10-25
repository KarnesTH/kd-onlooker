<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-on-dark.svg" />
    <img src="assets/logo-on-light.svg" width="96" height="96" alt="Onlooker" />
  </picture>
</p>

<h1 align="center">Onlooker</h1>

<p align="center">See who's watching: a read-only Firefox extension that reveals what websites share about you with third parties.</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.0-b210f2" alt="Version 0.1.0" />
  <img src="https://img.shields.io/badge/Firefox-140%2B-ff7139?logo=firefoxbrowser&logoColor=white" alt="Firefox 140+" />
  <img src="https://img.shields.io/badge/Manifest-V3-322a44" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/data%20collection-none-6fd6a1" alt="Data collection: none" />
</p>

## Features

- Counts the companies a page informs about your visit and shows the number on the toolbar icon.
- Explains in plain language what each company learns: page, title, screen size, language, time zone, browser, cookies.
- Spots ID-like values that reach the same company on several sites.
- Shows the cookies each company was sent, with lifetime and decoded content.
- Technical details with every request, parameter, header and raw cookie value.
- English and German.

## Privacy

Onlooker only reads. It blocks nothing, changes nothing and has no network access of its own. Everything is evaluated locally. The requests of open tabs are kept in memory only. On disk, IDs are stored as SHA-256 hashes and sites as short salted hashes that cannot be mapped back to a single site; cookie values are never stored. Nothing is written to disk from private windows.

## Development

```sh
web-ext run
web-ext lint --ignore-files docs tests
web-ext build --ignore-files docs tests
node --test
```

## Docs

- [Architecture](docs/architecture.md)
- [Data flow](docs/data-flow.md)
- [Data model](docs/data-model.md)
- [Detection](docs/detection.md)