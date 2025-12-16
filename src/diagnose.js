/**
 * Script de diagnóstico para descobrir os seletores da interface de apostas
 * Executa: node src/diagnose.js
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_DATA_DIR = path.join(__dirname, '..', 'data', 'browser-session');
const GAME_URL = 'https://spinbetter2z.com/br/games/crash';

async function findGameFrame(page) {
  const frames = page.frames();
  for (const frame of frames) {
    const url = frame.url();
    if (url.includes('games-frame') || url.includes('/games/371')) {
      const hasGame = await frame.locator('.crash-game__mountains').count();
      if (hasGame > 0) {
        return frame;
      }
    }
  }
  return null;
}

async function diagnose() {
  console.log('='.repeat(60));
  console.log('       DIAGNÓSTICO DA INTERFACE DE APOSTAS');
  console.log('='.repeat(60));
  console.log('\n[Diagnose] Iniciando navegador...');

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1400, height: 900 },
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const page = await context.newPage();

  console.log('[Diagnose] Navegando para:', GAME_URL);

  try {
    await page.goto(GAME_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (err) {
    console.log('[Diagnose] Timeout no carregamento, continuando...');
  }

  console.log('[Diagnose] Aguardando página carregar...');
  await page.waitForTimeout(5000);

  console.log('[Diagnose] Procurando iframe do jogo...');

  let gameFrame = null;
  for (let i = 0; i < 30; i++) {
    gameFrame = await findGameFrame(page);
    if (gameFrame) break;
    await page.waitForTimeout(2000);
    console.log('[Diagnose] Aguardando iframe...');
  }

  if (!gameFrame) {
    console.error('[Diagnose] Iframe não encontrado!');
    await context.close();
    return;
  }

  console.log('[Diagnose] Iframe encontrado! Analisando interface...\n');

  // Analisa a interface de apostas
  const analysis = await gameFrame.evaluate(() => {
    const results = {
      betPanels: [],
      inputs: [],
      buttons: [],
      autoCashout: [],
      gameState: {},
      allClasses: new Set()
    };

    // Procura painéis de aposta
    const betPanelSelectors = [
      '.crash-bet',
      '.bet-panel',
      '.betting-panel',
      '[class*="bet"]',
      '[class*="stake"]',
      '[class*="wager"]'
    ];

    betPanelSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        results.betPanels.push({
          selector,
          className: el.className,
          id: el.id,
          tagName: el.tagName,
          childCount: el.children.length,
          innerHTML: el.innerHTML.substring(0, 500)
        });
      });
    });

    // Procura inputs
    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => {
      results.inputs.push({
        type: input.type,
        className: input.className,
        id: input.id,
        name: input.name,
        placeholder: input.placeholder,
        value: input.value,
        parentClass: input.parentElement?.className
      });
    });

    // Procura botões
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => {
      results.buttons.push({
        className: btn.className,
        id: btn.id,
        text: btn.textContent?.trim().substring(0, 50),
        disabled: btn.disabled,
        parentClass: btn.parentElement?.className
      });
    });

    // Procura elementos de auto-cashout
    const autoCashoutSelectors = [
      '[class*="cashout"]',
      '[class*="auto"]',
      '[class*="cash-out"]'
    ];

    autoCashoutSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        results.autoCashout.push({
          selector,
          className: el.className,
          tagName: el.tagName,
          text: el.textContent?.trim().substring(0, 100)
        });
      });
    });

    // Estado do jogo
    const mountains = document.querySelector('.crash-game__mountains');
    results.gameState = {
      isRunning: mountains?.classList.contains('crash-game__mountains--game') || false,
      mountainsClass: mountains?.className
    };

    // Coleta todas as classes únicas para análise
    document.querySelectorAll('*').forEach(el => {
      if (el.className && typeof el.className === 'string') {
        el.className.split(' ').forEach(c => {
          if (c.includes('bet') || c.includes('stake') || c.includes('cash') ||
              c.includes('button') || c.includes('input') || c.includes('amount')) {
            results.allClasses.add(c);
          }
        });
      }
    });

    results.allClasses = Array.from(results.allClasses);

    return results;
  });

  console.log('='.repeat(60));
  console.log('                    RESULTADOS');
  console.log('='.repeat(60));

  console.log('\n📊 ESTADO DO JOGO:');
  console.log(JSON.stringify(analysis.gameState, null, 2));

  console.log('\n🎰 PAINÉIS DE APOSTA ENCONTRADOS:', analysis.betPanels.length);
  analysis.betPanels.slice(0, 10).forEach((panel, i) => {
    console.log(`\n  [${i + 1}] Selector: ${panel.selector}`);
    console.log(`      Class: ${panel.className}`);
    console.log(`      Tag: ${panel.tagName}, Children: ${panel.childCount}`);
  });

  console.log('\n📝 INPUTS ENCONTRADOS:', analysis.inputs.length);
  analysis.inputs.forEach((input, i) => {
    console.log(`\n  [${i + 1}] Type: ${input.type}`);
    console.log(`      Class: ${input.className}`);
    console.log(`      ID: ${input.id || '(none)'}`);
    console.log(`      Placeholder: ${input.placeholder || '(none)'}`);
    console.log(`      Value: ${input.value || '(empty)'}`);
    console.log(`      Parent: ${input.parentClass}`);
  });

  console.log('\n🔘 BOTÕES ENCONTRADOS:', analysis.buttons.length);
  analysis.buttons.forEach((btn, i) => {
    console.log(`\n  [${i + 1}] Text: "${btn.text}"`);
    console.log(`      Class: ${btn.className}`);
    console.log(`      Disabled: ${btn.disabled}`);
  });

  console.log('\n💰 ELEMENTOS AUTO-CASHOUT:', analysis.autoCashout.length);
  analysis.autoCashout.slice(0, 10).forEach((el, i) => {
    console.log(`\n  [${i + 1}] Selector: ${el.selector}`);
    console.log(`      Class: ${el.className}`);
    console.log(`      Text: ${el.text}`);
  });

  console.log('\n🏷️ CLASSES RELEVANTES ENCONTRADAS:');
  console.log(analysis.allClasses.join(', '));

  console.log('\n' + '='.repeat(60));
  console.log('Diagnóstico concluído! Navegador permanece aberto para inspeção manual.');
  console.log('Pressione Ctrl+C para fechar.');
  console.log('='.repeat(60));

  // Mantém o navegador aberto para inspeção manual
  await new Promise(() => {});
}

diagnose().catch(console.error);
