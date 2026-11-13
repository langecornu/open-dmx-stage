// Offers a file to save, without leaving the page.

/**
 * @param {string} name file name
 * @param {string} text contents
 */
export function downloadFile(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
