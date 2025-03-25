const moduleID = 'feature-class-filtering';

const lg = x => console.log(x);


Hooks.once('init', async () => {
    libWrapper.register(moduleID, 'dnd5e.dataModels.item.FeatData.compendiumBrowserFilters', newFeatFilters, 'WRAPPER');

    await dnd5e.registry.ready;
    game.modules.get(moduleID).api = {
        featuresByClass: {}
    };
    const featuresByClass = game.modules.get(moduleID).api.featuresByClass;
    for (const cls of Object.keys(dnd5e.registry.classes.choices)) featuresByClass[cls] = [];

    const interim = game.packs
        .filter(p => p.metadata.type === 'Item')
        .map(async p => await Promise.all(
            (await p.getIndex({ fields: [`flags.${moduleID}`] })).filter(i => i.type === 'feat')
        ));
    const res = (await Promise.all(interim)).flat();

    res.forEach(f => {
        const selectedClasses = f.flags?.[moduleID]?.selectedClasses;
        if (!selectedClasses || !selectedClasses.length) return;

        for (const selectedClass of selectedClasses) {
            featuresByClass[selectedClass].push(f.uuid);
        }
    });
});

Hooks.once('ready', async () => {
});


Hooks.on('renderTidy5eItemSheetClassic', (app, html) => {
    const { item } = app;
    if (item.type !== 'feat') return;
    if (html.querySelector('button.fa-asterisk')) return;

    const classesButton = document.createElement('button');
    classesButton.type = 'button';
    classesButton.dataset.tooltip = 'Set Feature Classes';
    classesButton.classList.add('header-control', 'fa-solid', 'fa-asterisk');
    classesButton.addEventListener('click', () => new ClassSelector(item).render(true));
    const closeButton = html.querySelector('button.fa-times');
    closeButton.before(classesButton);

});


function newFeatFilters(wrapped) {
    const filters = wrapped();

    filters.set('class', {
        label: 'Class',
        type: 'set',
        createFilter: (filters, value, def) => {
            let include = new Set();
            let exclude = new Set();
            for (const [type, identifiers] of Object.entries(value ?? {})) {
                for (const [identifier, v] of Object.entries(identifiers)) {
                    // const list = dnd5e.registry.spellLists.forType(type, identifier);
                    const list = new Set(game.modules.get(moduleID).api.featuresByClass[identifier] ?? []);
                    if (!list || (v === 0)) continue;
                    if (v === 1) include = include.union(list);
                    else if (v === -1) exclude = exclude.union(list);
                }
            }
            if (include.size) filters.push({ k: "uuid", o: "in", v: include });
            if (exclude.size) filters.push({ o: "NOT", v: { k: "uuid", o: "in", v: exclude } });
        },
        config: {
            choices: Object.entries(dnd5e.registry.classes.choices).reduce((acc, [k, v]) => {
                acc[`class.${k}`] = { label: v };
                return acc;
            }, {})
        }
    });

    return filters;
}


const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

class ClassSelector extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(feat) {
        super();

        this.feat = feat;
    }
    static DEFAULT_OPTIONS = {
        id: moduleID,
        form: {
            handler: ClassSelector.#onSubmit,
            closeOnSubmit: true
        },
        tag: 'form',
        window: {
            title: 'Select Classes',
            contentClasses: ['standard-form']
        }
    };

    static PARTS = {
        form: {
            template: `modules/${moduleID}/templates/class-selector.hbs`
        },
        footer: {
            template: 'templates/generic/form-footer.hbs'
        }
    }

    _prepareContext() {
        const context = { classes: [] };
        const selectedClasses = this.feat.getFlag(moduleID, 'selectedClasses') ?? [];
        for (const [k, v] of Object.entries(dnd5e.registry.classes.choices)) {
            context.classes.push({
                id: k,
                label: v,
                checked: selectedClasses.includes(k)
            });
        }
        context.buttons = [
            { type: 'submit', icon: 'fa-solid fa-save', label: 'SETTINGS.Save' }
        ];

        return context;
    }

    static #onSubmit(event, form, formData) {
        const selectedClasses = [];
        for (const [k, v] of Object.entries(formData.object)) {
            if (v) selectedClasses.push(k);
        }

        return this.feat.setFlag(moduleID, 'selectedClasses', selectedClasses);
    }

}
