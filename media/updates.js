// Rendered inside the webview view. Receives {type:'state', updates, banner, searching, labels}
// from the host and renders the pending-updates list.
const vscode = acquireVsCodeApi()
let state
window.addEventListener('message', (event) => {
  if (event.data?.type === 'state') {
    state = event.data
    render()
  }
})
vscode.postMessage({ type: 'ready' })

function render() {
  const autoUpdate = document.getElementById('auto-update')
  autoUpdate.textContent = ''
  autoUpdate.className = state.autoUpdate === 'disabled' ? 'centered' : ''
  const line = document.createElement('div')
  line.className = 'auto-update'
  if (state.autoUpdate === 'disabled') line.appendChild(stateIcon(CHECK_PATH))
  else line.appendChild(stateIcon(CLOSE_PATH))
  line.append(state.labels.autoUpdateText[state.autoUpdate])
  autoUpdate.appendChild(line)
  if (state.needsReload) {
    autoUpdate.appendChild(actionButton(state.labels.reload, 'reload', 'fix'))
  } else if (state.autoUpdate !== 'disabled') {
    autoUpdate.appendChild(actionButton(state.labels.fix, 'fixAutoUpdate', 'fix'))
  }

  const banner = document.getElementById('banner')
  banner.textContent = ''
  const reloadBanner = document.getElementById('reload-banner')
  reloadBanner.textContent = ''
  if (state.reloadBanner) {
    const box = document.createElement('div')
    box.className = 'banner reload'
    box.textContent = state.reloadBanner
    const reloadButton = actionButton(state.labels.reloadVscode, 'reload', 'reload')
    box.appendChild(reloadButton)
    reloadBanner.appendChild(box)
  }
  if (state.banner) {
    const box = document.createElement('div')
    box.className = 'banner'
    box.textContent = state.banner
    banner.appendChild(box)
  }
  const status = document.getElementById('status')
  status.textContent = state.searching ? state.labels.searching : ''

  const actions = document.getElementById('actions-group')
  actions.textContent = ''
  actions.style.display = state.updates.length > 0 ? '' : 'none'
  if (state.updates.length > 0) {
    actions.appendChild(actionButton(state.labels.checkUpdates, 'refresh'))
    actions.appendChild(actionButton(state.labels.updateAll, 'updateAll'))
  }

  const title = document.getElementById('pending-title')
  title.textContent = ''
  if (state.updates.length > 0) {
    title.textContent = state.labels.pendingUpdates
  } else {
    title.appendChild(actionButton(state.labels.checkUpdates, 'refresh'))
  }

  const list = document.getElementById('list')
  list.textContent = ''
  if (state.updates.length === 0 && !state.searching) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.appendChild(stateIcon(CHECK_PATH))
    empty.append(state.labels.empty)
    list.appendChild(empty)
  }
  for (const update of state.updates) {
    list.appendChild(row(update))
  }
}

function row(update) {
  const rowEl = document.createElement('div')
  rowEl.className = 'row'

  const icon = document.createElement(update.iconUrl ? 'img' : 'div')
  if (update.iconUrl) {
    icon.className = 'icon'
    icon.src = update.iconUrl
    icon.alt = ''
  } else {
    icon.className = 'icon fallback'
    icon.textContent = update.displayName.charAt(0).toUpperCase()
  }
  rowEl.appendChild(icon)

  const main = document.createElement('div')
  main.className = 'main'
  const name = document.createElement('div')
  name.className = 'name'
  name.textContent = update.displayName
  name.title = update.id
  const age = document.createElement('div')
  age.className = update.recent ? 'age recent' : 'age'
  age.textContent = update.age
  const line2 = document.createElement('div')
  line2.className = 'line2'
  line2.textContent = `${update.installedVersion} → ${update.availableVersion} · ${update.publisher}`
  main.appendChild(name)
  main.appendChild(age)
  main.appendChild(line2)
  if (update.pastVulnsLabel) {
    const past = document.createElement('div')
    past.className = 'past-vulns'
    past.textContent = update.pastVulnsLabel
    main.appendChild(past)
  }
  if (update.installedVulns?.length) {
    main.appendChild(osvList('installed-vulns', state.labels.installedVulns, update.installedVulns))
  }
  if (update.malicious?.length) {
    main.appendChild(osvList('findings', state.labels.maliciousFindings, update.malicious))
  }
  rowEl.appendChild(main)

  if (update.malicious?.length || update.updated) {
    const tag = document.createElement('span')
    tag.className = `tag ${update.updated ? 'updated' : 'malware'}`
    tag.textContent = update.updated ? state.labels.updated : state.labels.maliciousButton
    rowEl.appendChild(tag)
    return rowEl
  }

  if (update.updating) {
    const tag = document.createElement('span')
    tag.className = 'tag updating'
    tag.textContent = state.labels.updating
    rowEl.appendChild(tag)
    return rowEl
  }

  const button = document.createElement('button')
  button.className = update.installedVulns?.length ? 'must' : update.recent ? 'soon' : ''
  button.textContent = update.installedVulns?.length ? state.labels.mustUpdate : state.labels.update
  button.addEventListener('click', () => vscode.postMessage({ type: 'update', update }))
  rowEl.appendChild(button)
  return rowEl
}

/** Button that sends a message to the host on click. */
function actionButton(label, type, className) {
  const button = document.createElement('button')
  if (className) button.className = className
  button.textContent = label
  button.addEventListener('click', () => vscode.postMessage({ type }))
  return button
}

/** Div with a label followed by comma-separated links to OSV entries. */
function osvList(className, label, osvIds) {
  const box = document.createElement('div')
  box.className = className
  box.append(`${label} `)
  osvIds.forEach((osvId, index) => {
    if (index > 0) box.append(', ')
    const link = document.createElement('a')
    link.href = `https://osv.dev/vulnerability/${osvId}`
    link.textContent = osvId
    box.append(link)
  })
  return box
}

/** Codicon paths (microsoft/vscode-codicons); tinted by CSS via currentColor. */
const CHECK_PATH =
  'M13.6572 3.13573C13.8583 2.9465 14.175 2.95614 14.3643 3.15722C14.5535 3.35831 14.5438 3.675 14.3428 3.86425L5.84277 11.8642C5.64597 12.0494 5.33756 12.0446 5.14648 11.8535L1.64648 8.35351C1.45121 8.15824 1.45121 7.84174 1.64648 7.64647C1.84174 7.45121 2.15825 7.45121 2.35351 7.64647L5.50976 10.8027L13.6572 3.13573Z'
const CLOSE_PATH =
  'M13.85 13.1502C14.05 13.3502 14.05 13.6602 13.85 13.8602C13.75 13.9602 13.62 14.0102 13.5 14.0102C13.38 14.0102 13.24 13.9602 13.15 13.8602L8 8.71023L2.85 13.8602C2.75 13.9602 2.62 14.0102 2.5 14.0102C2.38 14.0102 2.24 13.9602 2.15 13.8602C1.95 13.6602 1.95 13.3502 2.15 13.1502L7.3 8.00023L2.15 2.85023C1.95 2.65023 1.95 2.34023 2.15 2.14023C2.35 1.94023 2.66 1.94023 2.86 2.14023L8.01 7.29023L13.16 2.14023C13.36 1.94023 13.67 1.94023 13.87 2.14023C14.07 2.34023 14.07 2.65023 13.87 2.85023L8.72 8.00023L13.87 13.1502H13.85Z'

function stateIcon(pathD) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('width', '16')
  svg.setAttribute('height', '16')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', pathD)
  svg.appendChild(path)
  return svg
}
