const axios = require("axios")
const crypto = require('crypto')
const slugify = require('slugify')
const moment = require('moment')
// xnide 1
function isArray(a) {
    return (!!a) && (a.constructor === Array);
};

function formatDataObject(obj) {
    if (typeof obj !== 'object' || obj === null || typeof obj.getMonth === 'function') {
        return obj;
    }
    if (isArray(obj)) {
        return obj.map((o) => formatDataObject(o));
    }
    return Object.keys(obj).reduce((prev, curr) => {
        var value = obj[curr];
        if (curr.toLowerCase() === 'value') {

            prev.value_string = null;
            prev.value_object = null;
            prev.value_array_object = null;
            if (isArray(obj[curr])) {
                prev.value_array_object = obj[curr];
            } else if (typeof obj[curr] === 'object') {
                prev.value_object = obj[curr];
            } else {
                prev.value_string = obj[curr];
            }
            delete prev.value
            delete obj.value
        }
        prev[curr] = formatDataObject(obj[curr]);
        return prev;
    }, {});
}

exports.sourceNodes = async ({ actions, createNodeId }, configOptions) => {
    const { createNode } = actions

    // Gatsby adds a configOption that's not needed for this plugin, delete it
    delete configOptions.plugins

    const processItems = (item, node_id, type, p) => {
        p = p || '';
        const nodeId = createNodeId(node_id + '-' + item.id + p)
        const nodeContent = JSON.stringify(item)
        const nodeContentDigest = crypto
            .createHash('md5')
            .update(nodeContent)
            .digest('hex')

        const nodeData = Object.assign({}, item, {
            id: nodeId,
            parent: null,
            children: [],
            internal: {
                type: type,
                content: nodeContent,
                contentDigest: nodeContentDigest,
            },
        })

        return nodeData
    }

    /**
     * XNIDE api adresa na google app engine
     */
    const XNIDE_API_URL = 'https://cohesive-cell-209808.appspot.com/api'

    /**
     * Settings
     */
    const settings = await axios.post(XNIDE_API_URL, { ...configOptions, action: 'settings' });
    const nodeDatasettings = processItems(settings.data[0], 'xnide-settings', 'XnideSettings');
    createNode(nodeDatasettings);

    /**
     * Media
     */
    const media = await axios.post(XNIDE_API_URL, { ...configOptions, action: 'media' });
    media.data.forEach(item => {
        const nodeData = processItems(item, 'xnide-media', 'XnideMedia');
        createNode(nodeData)
    });

    /**
     * Kolekce
     */
    const collectionList = await axios.post(XNIDE_API_URL, { ...configOptions, action: 'collectionList' });
    collectionList.data.forEach(item => {
        const nodeData = processItems(item, 'xnide-collections', 'XnideCollections');
        createNode(nodeData)
    });

    /**
     * Polozky kolekce
     * doplneny o pomocne promenne
     */
    const collectionItems = await axios.post(XNIDE_API_URL, { ...configOptions, action: 'collectionItems' });
    collectionItems.data.forEach(item => {


        for (let a of item.data) {
            for (let b of a.elements) {
                if (b.type === 'mediaFolder') {
                    b.value.data = JSON.parse(JSON.stringify(media.data.filter(m => m.parent === b.value.id)));
                }
            }
        }
        item = formatDataObject(item);
        for (let a of item.data) {
            const filter = a.elements.filter(x => x.name === item.slug_column_name);
            if (filter.length > 0) {
                item.name = filter[0].value_string;
                item.slug = slugify(item.name, { lower: true });
            }

            const filterCollection = collectionList.data.filter(x => x.id === item.collection_id);
            if (filterCollection.length > 0) {
                item.collection_name = filterCollection[0].title;
                item.collection_slug = slugify(item.collection_name, { lower: true });
            }

            const filterMainImage = a.elements.filter(x => x.name === 'image');
            if (filterMainImage.length > 0) {
                item.image = filterMainImage[0].value_object.imageUrl;
            }

            const created = new Date(item.created);
            item.slug_date = moment(created).format('YYYY/MM/DD');
            item.slug_date_full = '/' + item.slug_date + '/' + item.slug;
        }

        //
        // node pro kazdou kolekci se vsema jazykama/tabs
        //
        const nodeData = processItems(item, 'xnide-collection-item', 'XnideCollectionItem');
        createNode(nodeData);

        //
        // node na kazdy jazyk/tab
        //
        for (const l of item.data) {
            delete item.data;
            const data = {
                ...item,
                language: l.name,
                elements: l.elements
            }
            const nodeDataLocalize = processItems(data, 'xnide-collection-item-localize', 'XnideCollectionItemLocalize', l.name);
            createNode(nodeDataLocalize);
        }

    });
}
