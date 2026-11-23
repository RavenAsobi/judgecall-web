/** 只读当前页面可见 HTML 表格，不访问私有 API；列含义由用户在弹窗确认。 */
export function extractVisibleStandingsTables() {
  return Array.from(document.querySelectorAll('table')).filter(table => table.getClientRects().length > 0)
    .map((table, index) => {
      const headers = Array.from(table.querySelectorAll('thead tr:last-child th')).map(cell => cell.textContent?.trim() || '')
      const allRows = Array.from(table.querySelectorAll('tr'))
      const bodyRows = Array.from(table.querySelectorAll('tbody tr'))
      const selected = bodyRows.length ? bodyRows : allRows.slice(headers.length ? 1 : 0)
      const inferredHeaders = headers.length ? headers : Array.from(allRows[0]?.querySelectorAll('th,td') || [])
        .map(cell => cell.textContent?.trim() || '')
      const rows = selected.map(row => {
        const cells = Array.from(row.querySelectorAll('td'))
        return {
          cells: cells.map(cell => cell.textContent?.trim() || ''),
          ids: cells.map(cell => cell.querySelector('[data-id],[data-player-id]')?.getAttribute('data-id') ||
            cell.querySelector('[data-player-id]')?.getAttribute('data-player-id') || null),
        }
      }).filter(row => row.cells.length >= 2 && row.cells.some(value => value))
      return { headers: inferredHeaders, rows, label: `表格 ${index + 1}` }
    }).filter(grid => grid.headers.length >= 2 && grid.rows.length > 0)
}
