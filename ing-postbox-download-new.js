// ==UserScript==
// @name        Download documents from postbox - ing.de
// @namespace   https://github.com/ja-ka/violentmonkey
// @match       https://banking.ing.de/app/postbox/postbox
// @match       https://banking.ing.de/app/postbox/postbox_archiv
// @grant       GM_download
// @grant       GM_getValue
// @grant       GM_setValue
// @require     https://cdn.jsdelivr.net/npm/jquery@3/dist/jquery.min.js
// @require     https://cdn.jsdelivr.net/combine/npm/@violentmonkey/dom@1,npm/@violentmonkey/ui@0.5
// @version     2.0
// @author      Jascha Kanngießer / Andy Dunkel
// @description Places buttons to download all documents visible on the page with improved error handling
// @icon        https://www.ing.de/favicon-32x32.png
// @run-at      document-end
// ==/UserScript==

(function () {
    $(document).ready(function () {
      const NAME = "Alle herunterladen";    
      const RETRY_ATTEMPTS = 3;
      const RETRY_DELAY = 1000; // 1 second
      const EXPAND_DELAY = 500; // 500ms wait for expand animation
  
      const download = async (url, name, attempt = 1) => new Promise((resolve, reject) => {
        GM_download({
          url,
          name,
          onprogress: (progress) => {
            if (progress.status === 200) {
              setTimeout(() => resolve(), 200);
            }
          },
          onerror: async (error) => {
            if (attempt < RETRY_ATTEMPTS) {
              console.log(`Retry attempt ${attempt + 1} for ${name}`);
              await new Promise(r => setTimeout(r, RETRY_DELAY));
              try {
                await download(url, name, attempt + 1);
                resolve();
              } catch (err) {
                reject(err);
              }
            } else {
              reject(error);
            }
          },
          onabort: reject,
          ontimeout: reject
        });
      });
  
      // Wait for element to be visible and get its value
      const waitForElement = async (selector, context, timeout = 5000) => {
        return new Promise((resolve, reject) => {
          const startTime = Date.now();
          
          const checkElement = () => {
            const element = $(context).find(selector);
            if (element.length > 0 && element.is(':visible')) {
              resolve(element);
            } else if (Date.now() - startTime > timeout) {
              reject(new Error(`Timeout waiting for ${selector}`));
            } else {
              setTimeout(checkElement, 100);
            }
          };
          
          checkElement();
        });
      };
  
      let abort = false;
      let loading = false;
      const FILENAME_TEMPLATE_KEY = "FILENAME_TEMPLATE";
      let filenameTemplate = GM_getValue(FILENAME_TEMPLATE_KEY, "DD.MM.YYYY_ART_BETREFF");
      
      const addButton = (name, onClick) => {
        const container = $('.account-filters, .postbox-grid-actions').first();
        container.after(VM.createElement("button", {
          className: "button outline indigo font14",
          style: {
            marginRight: "10px",
            marginBottom: "15px"
          },
          onClick
        }, name));  
      }
      
      addButton("Dateinamen ändern", async function(event) {
        event.preventDefault();
        const newFilenameTemplate = prompt("Bitte gib ein Dateiname-Template ein:", filenameTemplate);
        
        if (newFilenameTemplate === null) return;
        
        const requiredFields = ['DD', 'MM', 'YYYY', 'ART', 'BETREFF'];
        if (!requiredFields.every(field => newFilenameTemplate.includes(field))) {
          alert('Bitte gib ein Template nach folgendem Muster ein: DD.MM.YYYY_ART_BETREFF');
          return;
        }
        
        GM_setValue(FILENAME_TEMPLATE_KEY, newFilenameTemplate);
        filenameTemplate = newFilenameTemplate;
      });     
      
      addButton(NAME, async function(event) {
        event.preventDefault();
        if (loading) {
          abort = true;
          return;
        }
  
        loading = true;
        const errors = [];
        let downloadButton = this;
  
        try {
          let downloaded = 0;
          const rows = $('.ibbr-table-row');
          const total = rows.length;
  
          const updateProgress = () => {
            downloaded += 1;
            downloadButton.innerHTML = `${downloaded} / ${total} verarbeitet (erneut klicken um abzubrechen)`;
          };
  
          for (let i = 0; i < rows.length; i++) {
            if (abort) break;
  
            const row = rows[i];
            try {
              // Extract document info
              const art = $(row).find('.postbox-grid-left > span:last-child').text().trim();
              const betreff = $(row).find('.postbox-grid-description').text().trim();
              const dateText = $(row).find('.postbox-grid-right').text().trim();
              const [day, month, year] = dateText.split('.');
  
              // Generate filename
              const name = filenameTemplate
                .replace('DD', day)
                .replace('MM', month)
                .replace('YYYY', year)
                .replace('ART', art.replace(/[^A-Za-z0-9ÄÖÜäöüß]/g, '_'))
                .replace('BETREFF', betreff.replace(/[^A-Za-z0-9ÄÖÜäöüß]/g, '_')) + '.pdf';
  
              // Click expand button and wait for content
              const expandBtn = $(row).find('.ibbr-table-arrow-btn');
              expandBtn.click();
              
              // Wait for download link to appear
              const downloadLink = await waitForElement('a[data-no-busy-indicator]', row);
              const url = "https://banking.ing.de/app/postbox" + downloadLink.attr('href').substring(1);
  
              await download(url, name);
              updateProgress();
              
              // Close the expanded section
              expandBtn.click();
              await new Promise(resolve => setTimeout(resolve, EXPAND_DELAY));
              
            } catch (err) {
              errors.push(`Fehler bei Dokument ${i + 1}: ${err.message}`);
              updateProgress();
            }
          }
  
          if (errors.length > 0) {
            console.error('Download errors:', errors);
            alert(`Downloads abgeschlossen mit ${errors.length} Fehlern. Details in der Konsole.`);
          } else {
            alert('Alle Downloads erfolgreich abgeschlossen!');
          }
        } catch (err) {
          alert(`Ein unerwarteter Fehler ist aufgetreten: ${err.message}`);
          console.error('Unexpected error:', err);
        }
  
        abort = false;
        loading = false;
        downloadButton.innerHTML = NAME;
      });    
    });
  })();