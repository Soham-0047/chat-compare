# AI Chat Comparator

A browser-extension comparison tool for evaluating prompts across multiple AI chat tabs, with an additional direct API execution mode for OpenAI-compatible models.

## Features

- Detects open ChatGPT and Grok tabs automatically
- Lets you choose one or more AI tabs to compare
- Sends the same prompt to each selected tab
- Aggregates results in a side-by-side popup experience
- Supports a direct LLM API path for OpenAI, OpenRouter, Groq, Anthropic, and custom OpenAI-compatible endpoints
- Stores simple query history locally when enabled

## Setup

1. Open Chrome or Edge and navigate to `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this project folder.
5. Open the extension popup and choose either Browser AI or Direct API.

## Direct API mode

Use Direct API when you want the extension to call a remote model without opening browser tabs.

Supported providers:
- OpenAI
- OpenRouter
- Groq
- Anthropic
- Custom OpenAI-compatible endpoints

Required inputs:
- Provider
- Model
- API key
- Base URL (for custom or non-default providers)

## Privacy notice

This project is intended for personal testing and evaluation. Respect each provider's Terms of Service, rate limits, and privacy requirements.

## Files

- `background.js` — background worker and LLM API bridge
- `content-chatgpt.js` — ChatGPT tab automation logic
- `content-grok.js` — Grok tab automation logic
- `popup.html` — extension popup layout
- `popup.js` — popup behavior and response handling
- `manifest.json` — extension permissions and host access
- `styles.css` — popup styling
- `utils.js` — shared utilities for tabs and interactions
