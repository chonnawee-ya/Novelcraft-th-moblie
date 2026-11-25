import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { NovelProjectSchema, SCHEMA_VERSION, type NovelProject } from '../types/novel';

function sanitizeFilename(name: string): string {
  return (
    name
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 80) || 'novel_outline'
  );
}

function triggerDownload(content: string, filename: string, mimeType: string) {
  if (Capacitor.isNativePlatform()) {
    void (async () => {
      try {
        const saved = await Filesystem.writeFile({
          path: filename,
          data: content,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });
        await Share.share({
          title: filename,
          url: saved.uri,
          dialogTitle: `ส่งออกไฟล์ ${filename}`,
        });
      } catch (err) {
        console.error('Native export failed:', err);
      }
    })();
    return;
  }

  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportAsMarkdown(project: NovelProject): void {
  const { metadata, macroOutline, chapters, rollingSummary } = project;
  const lines: string[] = [];

  lines.push(`# ${metadata.title}`);
  lines.push('');
  lines.push(`- **แนวนิยาย:** ${metadata.genres.join(', ')}`);
  lines.push(`- **โครงสร้างเรื่อง:** ${metadata.structureTemplate}`);
  lines.push(`- **โทนเรื่อง:** ${metadata.tone}`);
  lines.push(`- **กลุ่มเป้าหมาย:** ${metadata.targetAudience}`);
  lines.push(`- **จำนวนตอนเป้าหมาย:** ${metadata.targetChapterCount} ตอน (วางโครงแล้ว ${chapters.length} ตอน)`);
  lines.push('');

  lines.push('## แก่นเรื่อง (Logline)');
  lines.push(`> ${macroOutline.logline}`);
  lines.push('');

  lines.push('## โลกและกฎเกณฑ์ (World-Building / Lore Bible)');
  macroOutline.worldBuilding.forEach((wb) => {
    const pin = wb.isPinned ? ' 📌' : '';
    lines.push(`### ${wb.category}${pin}`);
    lines.push(wb.detail);
    lines.push('');
  });

  lines.push('## ตัวละครหลัก (Characters)');
  macroOutline.characters.forEach((c) => {
    const pin = c.isPinned ? ' 📌' : '';
    lines.push(`### ${c.name} (${c.role})${pin}`);
    if (c.archetype) lines.push(`- **บทบาทตามทฤษฎี:** ${c.archetype}`);
    lines.push(`- **เป้าหมายหลัก:** ${c.goal}`);
    lines.push(`- **จุดอ่อน / ปมในใจ:** ${c.flaw}`);
    lines.push(`- **ภูมิหลัง:** ${c.background}`);
    if (c.relationships) lines.push(`- **ความสัมพันธ์:** ${c.relationships}`);
    lines.push('');
  });

  lines.push(`## โครงเรื่องหลัก (${metadata.structureTemplate})`);
  macroOutline.plotBeats.forEach((beat, idx) => {
    lines.push(`### ${idx + 1}. [${beat.act}] ${beat.beatName}`);
    lines.push(beat.summary);
    lines.push('');
  });

  if (rollingSummary.trim()) {
    lines.push('## สรุปเหตุการณ์สะสมล่าสุด (Rolling Summary)');
    lines.push(rollingSummary);
    lines.push('');
  }

  if (chapters.length > 0) {
    lines.push('## โครงสร้างรายตอน (Chapter Beats)');
    chapters.forEach((ch) => {
      lines.push(`### ตอนที่ ${ch.chapterNumber}: ${ch.title}`);
      if (ch.linkedBeat) lines.push(`- **เชื่อมโยงจังหวะเรื่อง:** ${ch.linkedBeat}`);
      lines.push(`- **เป้าหมาย (Goal):** ${ch.goal}`);
      lines.push(`- **อุปสรรค/ความขัดแย้ง (Conflict):** ${ch.conflict}`);
      lines.push(`- **ผลลัพธ์ (Outcome):** ${ch.outcome}`);
      lines.push(`- **จุดทิ้งท้าย (Cliffhanger):** ${ch.cliffhanger}`);
      lines.push(`- **เรื่องย่อตอน:** ${ch.summary}`);
      if (ch.content?.trim()) {
        lines.push('');
        lines.push('#### เนื้อหาฉบับเต็ม');
        lines.push(ch.content.trim());
      }
      lines.push('');
    });
  }

  triggerDownload(lines.join('\n'), `${sanitizeFilename(metadata.title)}.md`, 'text/markdown');
}

export function exportManuscriptAsMarkdown(project: NovelProject): void {
  const { metadata, macroOutline, chapters } = project;
  const writtenChapters = chapters.filter((ch) => ch.content?.trim());
  const lines: string[] = [];

  lines.push(`# ${metadata.title}`);
  lines.push('');
  lines.push(`> ${macroOutline.logline}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  writtenChapters.forEach((ch) => {
    lines.push(`## ตอนที่ ${ch.chapterNumber}: ${ch.title}`);
    lines.push('');
    lines.push(ch.content.trim());
    lines.push('');
    lines.push('---');
    lines.push('');
  });

  triggerDownload(lines.join('\n'), `${sanitizeFilename(metadata.title)}_manuscript.md`, 'text/markdown');
}

export function exportManuscriptAsText(project: NovelProject): void {
  const { metadata, chapters } = project;
  const writtenChapters = chapters.filter((ch) => ch.content?.trim());
  const lines: string[] = [];

  lines.push(metadata.title);
  lines.push('============================================================');
  lines.push('');

  writtenChapters.forEach((ch) => {
    lines.push(`ตอนที่ ${ch.chapterNumber}: ${ch.title}`);
    lines.push('------------------------------------------------------------');
    lines.push('');
    lines.push(ch.content.trim());
    lines.push('');
    lines.push('');
  });

  triggerDownload(lines.join('\n'), `${sanitizeFilename(metadata.title)}_manuscript.txt`, 'text/plain');
}

export function exportAsPlainText(project: NovelProject): void {
  const { metadata, macroOutline, chapters } = project;
  const sep = '============================================================';
  const lines: string[] = [];

  lines.push(sep);
  lines.push(`ชื่อเรื่อง: ${metadata.title}`);
  lines.push(`แนวนิยาย: ${metadata.genres.join(', ')}`);
  lines.push(`โครงสร้าง: ${metadata.structureTemplate} | โทน: ${metadata.tone}`);
  lines.push(`กลุ่มเป้าหมาย: ${metadata.targetAudience} | เป้าหมาย: ${metadata.targetChapterCount} ตอน`);
  lines.push(sep);
  lines.push('');

  lines.push('[แก่นเรื่อง / LOGLINE]');
  lines.push(macroOutline.logline);
  lines.push('');

  lines.push('[โลกและกฎเกณฑ์ / WORLD-BUILDING]');
  macroOutline.worldBuilding.forEach((wb, i) => {
    lines.push(`${i + 1}. ${wb.category}${wb.isPinned ? ' [ปักหมุด]' : ''}`);
    lines.push(`   ${wb.detail}`);
  });
  lines.push('');

  lines.push('[ตัวละคร / CHARACTERS]');
  macroOutline.characters.forEach((c, i) => {
    lines.push(`${i + 1}. ${c.name} — ${c.role}${c.archetype ? ` (${c.archetype})` : ''}${c.isPinned ? ' [ปักหมุด]' : ''}`);
    lines.push(`   - เป้าหมาย: ${c.goal}`);
    lines.push(`   - ปม/จุดอ่อน: ${c.flaw}`);
    lines.push(`   - ภูมิหลัง: ${c.background}`);
    if (c.relationships) lines.push(`   - ความสัมพันธ์: ${c.relationships}`);
  });
  lines.push('');

  lines.push('[โครงเรื่องหลัก / PLOT BEATS]');
  macroOutline.plotBeats.forEach((b, i) => {
    lines.push(`${i + 1}. [${b.act}] ${b.beatName}`);
    lines.push(`   ${b.summary}`);
  });
  lines.push('');

  if (chapters.length > 0) {
    lines.push('[โครงสร้างรายตอน / CHAPTERS]');
    chapters.forEach((ch) => {
      lines.push(`--- ตอนที่ ${ch.chapterNumber}: ${ch.title} ---`);
      if (ch.linkedBeat) lines.push(`จังหวะเรื่อง: ${ch.linkedBeat}`);
      lines.push(`เป้าหมาย: ${ch.goal}`);
      lines.push(`ความขัดแย้ง: ${ch.conflict}`);
      lines.push(`ผลลัพธ์: ${ch.outcome}`);
      lines.push(`จุดทิ้งท้าย: ${ch.cliffhanger}`);
      lines.push(`สรุปตอน: ${ch.summary}`);
      lines.push('');
    });
  }

  triggerDownload(lines.join('\n'), `${sanitizeFilename(metadata.title)}.txt`, 'text/plain');
}

export function exportAsJson(project: NovelProject): void {
  const payload: NovelProject = {
    ...project,
    schemaVersion: SCHEMA_VERSION,
  };
  triggerDownload(
    JSON.stringify(payload, null, 2),
    `${sanitizeFilename(project.metadata.title)}_backup.json`,
    'application/json'
  );
}

export function parseImportedProjectJson(rawText: string): NovelProject {
  const parsed = JSON.parse(rawText);
  const validated = NovelProjectSchema.parse(parsed);
  return {
    ...validated,
    schemaVersion: SCHEMA_VERSION,
  };
}
