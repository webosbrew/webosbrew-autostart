import 'core-js/stable';
import 'regenerator-runtime';

import "webostvjs/webOSTV";

function lunaCall(uri, parameters) {
  return new Promise((resolve, reject) => {
    const s = uri.indexOf("/", 7);
    webOS.service.request(uri.substr(0, s), {
      method: uri.substr(s + 1),
      parameters,
      onSuccess: resolve,
      onFailure: (res) => {
        reject(new Error(JSON.stringify(res)));
      },
    });
  });
}

async function retry(attempt, cb) {
  while (true) {
    try {
      return await cb();
    } catch (err) {
      if (attempt--) {
        log (`An error occured, ${attempt} tries left...`);
        continue;
      }
      throw err;
    }
  }
}

function log(s) {
  document.querySelector('pre').innerText += `[${new Date()}] ${s}\n`;
}

(async () => {
  try {
    log('Registering input app...');
    await lunaCall('luna://com.webos.service.eim/addDevice', {
      appId: 'org.webosbrew.autostart',
      pigImage: '',
      mvpdIcon: '',
    });

    await retry(3, async () => {
      log('Setting up eim overlay...');
      const res = await lunaCall('luna://org.webosbrew.hbchannel.service/exec', {
        command: 'if [[ ! -d /var/lib/webosbrew/eim ]]; then cp -r /var/lib/eim /var/lib/webosbrew/eim; fi ; if ! findmnt /var/lib/eim; then mount --bind /var/lib/webosbrew/eim /var/lib/eim ; fi',
      });
      log(`Result: ${res.stdoutString} ${res.stderrString}`);
    });

    log("Launching autostart...");
    const res2 = await lunaCall('luna://org.webosbrew.hbchannel.service/autostart', {});
    log(`Result: ${res2.message}`);
    log("Checking last input app...");
    const lastinput = await lunaCall('luna://org.webosbrew.hbchannel.service/exec', {
      command: 'cat /var/lib/eim/lastinput',
    });
    if (lastinput.stdoutString) {
      const lastinputPayload = JSON.parse(lastinput.stdoutString);
      if (lastinputPayload.appId) {
        log(`Last input app: ${lastinputPayload.appId}`);
        if (lastinputPayload.appId !== 'org.webosbrew.autostart') {
          log("Relaunching...");
          await lunaCall('luna://com.webos.service.applicationManager/launch', {
            id: lastinputPayload.appId,
          });
        }
      }
    }
    log("Done.");
  } catch (err) {
    log(`An error occured: ${err.stack}`);
  }
})();
