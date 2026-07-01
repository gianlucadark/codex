/**
 * /llms.txt — mappa del sito leggibile da agenti/LLM (standard llmstxt.org).
 * Generata dai dati già presenti (site + projects) così resta sempre in sincrono
 * con il resto del codice: aggiungere un progetto lo pubblica anche qui.
 */
import type { APIRoute } from 'astro';
import { site } from '../data/site';
import { projects } from '../data/projects';

export const GET: APIRoute = () => {
	const folio = (slug: string) => `${site.url}/progetti/${slug}`;

	const projectLines = projects
		.map((p) => {
			const live = p.links?.find((l) => /demo|live|npm/i.test(l.it))?.href;
			const extra = live ? ` — live: ${live}` : '';
			return `- [${p.title}](${folio(p.slug)}): ${p.descEn} (${p.stack})${extra}`;
		})
		.join('\n');

	const body = `# ${site.name} — Codex

> ${site.role}. Portfolio a tema codice miniato (illuminated manuscript), bilingue italiano/inglese.

${site.description}
Il sito è una singola folio con sezioni ancorate (Chi sono, Il font, Progetti, Competenze, Contatti) più una folio dedicata per ogni progetto. La lingua si sceglie con ?lang=it|en.

## Progetti
${projectLines}

## Pagine chiave
- [Home](${site.url})
- [Progetti](${site.url}/#progetti)
- [Chi sono](${site.url}/#chi-sono)
- [Il font (Gianluca Hand)](${site.url}/#font)
- [Competenze](${site.url}/#competenze)
- [Contatti](${site.url}/#contatti)

## Contatti
- Email: ${site.contact.email}
- LinkedIn: ${site.contact.linkedin}
- Luogo: ${site.contact.place}
`;

	return new Response(body, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
};
