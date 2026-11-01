import fs from 'fs';
import path from 'path';

const targetPath = path.resolve(
  process.cwd(),
  'node_modules/app-builder-lib/out/targets/nsis/NsisTarget.js'
);

if (fs.existsSync(targetPath)) {
  const src = fs.readFileSync(targetPath, 'utf8');
  if (src.includes('if ((0, macosVersion_1.isMacOsCatalina)())')) {
    const updated = src.replace(
      /if \(\(0, macosVersion_1\.isMacOsCatalina\)\(\)\) \{[\s\S]*?await packager\.signIf\(uninstallerPath\);/,
      `try {
            await nsisUtil_1.UninstallerReader.exec(installerPath, uninstallerPath);
        }
        catch (error) {
            const wineVm = new WineVm_1.WineVmManager((_a = packager.config.toolsets) === null || _a === void 0 ? void 0 : _a.wine);
            await wineVm.exec(installerPath, [], { env: { __COMPAT_LAYER: "RunAsInvoker" } });
        }
        await packager.signIf(uninstallerPath);`
    );
    fs.writeFileSync(targetPath, updated, 'utf8');
    console.log('[ensure-nsis-linux] Patched NsisTarget.js to use pure-Node UninstallerReader.');
  }
}
