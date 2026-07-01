/** A group of related competences shown as one column of the Skills folio. */
export interface SkillGroup {
	title: string;
	/** Group summary — Italian voice. */
	descIt: string;
	/** Group summary — English voice. */
	descEn: string;
	/** Individual competences, rendered as a bulleted list. */
	items: string[];
}

export const skillGroups: SkillGroup[] = [
	{
		title: 'Frontend',
		descIt: 'Architetture Angular scalabili, UI curate e codice mantenibile.',
		descEn: 'Scalable Angular architectures, polished UI and maintainable code.',
		items: ['Angular · TypeScript', 'React · Astro', 'RxJS · NgRx', 'Accessibilità · Performance'],
	},
	{
		title: 'Backend',
		descIt: 'Integrazione con servizi Java, API REST e basi dati enterprise.',
		descEn: 'Integration with Java services, REST APIs and enterprise databases.',
		items: ['Java · Spring Boot', 'REST Controllers', 'JSP', 'OracleDB'],
	},
	{
		title: 'UI/UX · 3D',
		descIt: 'Approccio ibrido tra sviluppo e design, dal prototipo al dettaglio.',
		descEn: 'A hybrid development and design approach, from prototype to detail.',
		items: ['Figma', 'Google UX Design', 'Blender', 'User Experience'],
	},
	{
		title: 'Tooling',
		descIt: 'Pipeline, qualità del codice, deploy e sperimentazione web avanzata.',
		descEn: 'Pipelines, code quality, deploys and advanced web experimentation.',
		items: ['Git', 'Jenkins', 'Rust · WebAssembly'],
	},
];
