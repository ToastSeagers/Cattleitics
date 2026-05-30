/**
 * Glenthorpe Cattleitics - Mock Data and Initialization Script (mockData.js)
 * Pre-populates the farm database with high-quality, realistic South African cattle profiles,
 * financial transactions, medical logs, family links, and upcoming vaccination tasks.
 */

const MOCK_PADDOCKS = [
    { id: 'house_paddock', name: 'House Paddock', size: '5ha', type: 'Sweetveld', category: 'Homestead', description: 'Close to homestead, ideal for maternity and young calves.', coordinates: [[-33.3620, 26.5020], [-33.3620, 26.5040], [-33.3630, 26.5040], [-33.3630, 26.5020]] },
    { id: 'river_field', name: 'River Field', size: '12ha', type: 'Sourveld/Sweetveld mix', category: 'Riverine', description: 'Lush grass near the stream, good water access.', coordinates: [[-33.3630, 26.5020], [-33.3630, 26.5040], [-33.3645, 26.5040], [-33.3645, 26.5020]] },
    { id: 'ridge_pasture', name: 'Ridge Pasture', size: '18ha', type: 'Rocky sweetveld', category: 'Ridge', description: 'High ground, excellent drainage, used for general grazing.', coordinates: [[-33.3610, 26.5040], [-33.3610, 26.5065], [-33.3635, 26.5065], [-33.3635, 26.5040]] },
    { id: 'slope_paddock', name: 'Slope Paddock', size: '8ha', type: 'Wooded grass pasture', category: 'Wooded', description: 'Shaded areas, excellent during hot summer afternoons.', coordinates: [[-33.3635, 26.5040], [-33.3635, 26.5065], [-33.3655, 26.5065], [-33.3655, 26.5040]] }
];

const MOCK_CATTLE = [
    {
        tagId: 'GT001',
        name: 'Brutus',
        breed: 'Bonsmara',
        gender: 'Bull',
        dob: '2021-04-12',
        status: 'Active',
        pregnant: false,
        expectedCalvingDate: null,
        inseminationMethod: null,
        dam: '',
        sire: '',
        pasture: 'ridge_pasture',
        purchasePrice: 45000,
        purchaseDate: '2023-05-10',
        supplier: 'Sernick Bonsmaras',
        salePrice: null,
        saleDate: null,
        buyer: null,
        image: 'assets/images/bonsmara_bull.png',
        history: [
            { id: 101, date: '2023-05-10', type: 'Financial', description: 'Purchased from Sernick Bonsmaras for breeding stock.', performer: 'Toast Seagers' },
            { id: 102, date: '2023-06-01', type: 'Health', description: 'Tick dip and lumpy skin disease vaccination.', performer: 'Dr. Marais (Vet)' },
            { id: 103, date: '2024-10-15', type: 'Move', description: 'Transferred from River Field to Ridge Pasture for seasonal rotation.', performer: 'Toast Seagers' },
            { id: 104, date: '2025-05-02', type: 'Health', description: 'Annual fertility check completed. Rated excellent.', performer: 'Dr. Marais (Vet)' }
        ]
    },
    {
        tagId: 'GT002',
        name: 'Nandi',
        breed: 'Nguni',
        gender: 'Cow',
        dob: '2020-09-08',
        status: 'Active',
        pregnant: true,
        expectedCalvingDate: '2026-07-15',
        inseminationMethod: 'Bull (Brutus)',
        dam: '',
        sire: '',
        pasture: 'house_paddock',
        purchasePrice: 16000,
        purchaseDate: '2022-11-20',
        supplier: 'Bathurst Cattle Auction',
        salePrice: null,
        saleDate: null,
        buyer: null,
        image: 'assets/images/nguni_cow.png',
        history: [
            { id: 201, date: '2022-11-20', type: 'Financial', description: 'Purchased at Bathurst Auction.', performer: 'Toast Seagers' },
            { id: 202, date: '2023-11-04', type: 'Pregnancy', description: 'Gave birth to healthy heifer calf (GT006).', performer: 'Toast Seagers' },
            { id: 203, date: '2025-10-10', type: 'Pregnancy', description: 'Confirmed pregnant via rectal palpation.', performer: 'Dr. Marais (Vet)' },
            { id: 204, date: '2026-05-10', type: 'Health', description: 'Multimin90 injection and deworming.', performer: 'Toast Seagers' }
        ]
    },
    {
        tagId: 'GT003',
        name: 'Bella',
        breed: 'Brahman',
        gender: 'Cow',
        dob: '2019-02-15',
        status: 'Active',
        pregnant: false,
        expectedCalvingDate: null,
        inseminationMethod: null,
        dam: '',
        sire: '',
        pasture: 'river_field',
        purchasePrice: 22000,
        purchaseDate: '2021-08-14',
        supplier: 'Eastern Cape Brahman Breeders',
        salePrice: null,
        saleDate: null,
        buyer: null,
        image: 'assets/images/brahman_cow.png',
        history: [
            { id: 301, date: '2021-08-14', type: 'Financial', description: 'Purchased for core breeding herd.', performer: 'Toast Seagers' },
            { id: 302, date: '2022-10-01', type: 'Pregnancy', description: 'Gave birth to bull calf (GT007).', performer: 'Toast Seagers' },
            { id: 303, date: '2024-03-12', type: 'Health', description: 'Treated for eye infection (pinkeye) using terramycin spray.', performer: 'Toast Seagers' },
            { id: 304, date: '2026-01-20', type: 'Move', description: 'Moved to River Field for fresh clover pastures.', performer: 'Toast Seagers' }
        ]
    },
    {
        tagId: 'GT004',
        name: 'Spotty',
        breed: 'Nguni',
        gender: 'Cow',
        dob: '2021-11-30',
        status: 'Active',
        pregnant: true,
        expectedCalvingDate: '2026-09-05',
        inseminationMethod: 'Bull (Brutus)',
        dam: '',
        sire: '',
        pasture: 'house_paddock',
        purchasePrice: 14500,
        purchaseDate: '2023-02-15',
        supplier: 'Kowie River Stud',
        salePrice: null,
        saleDate: null,
        buyer: null,
        image: 'assets/images/nguni_cow.png',
        history: [
            { id: 401, date: '2023-02-15', type: 'Financial', description: 'Acquired from Kowie River Stud.', performer: 'Toast Seagers' },
            { id: 402, date: '2026-01-05', type: 'Pregnancy', description: 'Confirmed pregnant by vet.', performer: 'Dr. Marais (Vet)' }
        ]
    },
    {
        tagId: 'GT005',
        name: 'Tholo',
        breed: 'Nguni',
        gender: 'Steer',
        dob: '2023-11-04',
        status: 'Active',
        pregnant: false,
        expectedCalvingDate: null,
        inseminationMethod: null,
        dam: 'GT002',
        sire: 'GT001',
        pasture: 'river_field',
        purchasePrice: 0,
        purchaseDate: '2023-11-04',
        supplier: 'Homebred (Glenthorpe)',
        salePrice: null,
        saleDate: null,
        buyer: null,
        image: 'assets/images/nguni_cow.png',
        history: [
            { id: 501, date: '2023-11-04', type: 'Pregnancy', description: 'Calved naturally by Nandi (GT002). Sire: Brutus (GT001).', performer: 'Toast Seagers' },
            { id: 502, date: '2024-04-10', type: 'Health', description: 'Castrated and dehorned.', performer: 'Toast Seagers' },
            { id: 503, date: '2025-11-12', type: 'Health', description: 'Dosed with Ivomec for external and internal parasites.', performer: 'Toast Seagers' }
        ]
    },
    {
        tagId: 'GT006',
        name: 'Zola',
        breed: 'Nguni',
        gender: 'Heifer',
        dob: '2024-12-15',
        status: 'Active',
        pregnant: false,
        expectedCalvingDate: null,
        inseminationMethod: null,
        dam: 'GT002',
        sire: 'GT001',
        pasture: 'house_paddock',
        purchasePrice: 0,
        purchaseDate: '2024-12-15',
        supplier: 'Homebred (Glenthorpe)',
        salePrice: null,
        saleDate: null,
        buyer: null,
        image: 'assets/images/nguni_cow.png',
        history: [
            { id: 601, date: '2024-12-15', type: 'Pregnancy', description: 'Calved naturally by Nandi (GT002).', performer: 'Toast Seagers' },
            { id: 602, date: '2025-06-01', type: 'Health', description: 'Weaned successfully and branded.', performer: 'Toast Seagers' }
        ]
    },
    {
        tagId: 'GT007',
        name: 'Simba',
        breed: 'Brahman',
        gender: 'Bull',
        dob: '2022-10-01',
        status: 'Sold',
        pregnant: false,
        expectedCalvingDate: null,
        inseminationMethod: null,
        dam: 'GT003',
        sire: '',
        pasture: 'slope_paddock',
        purchasePrice: 0,
        purchaseDate: '2022-10-01',
        supplier: 'Homebred (Glenthorpe)',
        salePrice: 18500,
        saleDate: '2025-03-15',
        buyer: 'Salem Livestock Farms',
        image: 'assets/images/brahman_cow.png',
        history: [
            { id: 701, date: '2022-10-01', type: 'Pregnancy', description: 'Born to Bella (GT003).', performer: 'Toast Seagers' },
            { id: 702, date: '2025-03-15', type: 'Financial', description: 'Sold to Salem Livestock Farms for breeding purposes.', performer: 'Toast Seagers' }
        ]
    },
    {
        tagId: 'GT008',
        name: 'Rosie',
        breed: 'Bonsmara',
        gender: 'Heifer',
        dob: '2025-02-14',
        status: 'Active',
        pregnant: false,
        expectedCalvingDate: null,
        inseminationMethod: null,
        dam: '',
        sire: 'GT001',
        pasture: 'slope_paddock',
        purchasePrice: 11000,
        purchaseDate: '2025-10-15',
        supplier: 'Alexandria Weaner Sale',
        salePrice: null,
        saleDate: null,
        buyer: null,
        image: 'assets/images/bonsmara_bull.png',
        history: [
            { id: 801, date: '2025-10-15', type: 'Financial', description: 'Purchased as replacement heifer at Alexandria Weaner Sale.', performer: 'Toast Seagers' }
        ]
    }
];

const MOCK_TASKS = [
    {
        title: 'Lumpy Skin Disease (LSD) Vaccinations',
        description: 'Annual preventative vaccination for the entire active herd. Extremely important in humid Eastern Cape summers.',
        dueDate: '2026-06-05',
        status: 'Pending',
        category: 'Vaccination',
        targetCattle: 'All Active'
    },
    {
        title: 'Tick-Dipping Rotation',
        description: 'Dip entire herd in the spray race to prevent heartwater and redwater tick-borne diseases.',
        dueDate: '2026-05-30',
        status: 'Urgent',
        category: 'Treatment',
        targetCattle: 'All Active'
    },
    {
        title: 'Nandi Pre-Calving Check',
        description: 'Bring Nandi (GT002) close to the House Paddock to monitor body condition and prep for July calving.',
        dueDate: '2026-06-20',
        status: 'Pending',
        category: 'Pregnancy',
        targetCattle: 'GT002'
    },
    {
        title: 'Winter Feed Lick Setup',
        description: 'Distribute urea and protein lick blocks to the Ridge Pasture to supplement dry winter sweetveld grazing.',
        dueDate: '2026-06-10',
        status: 'Pending',
        category: 'Nutrition',
        targetCattle: 'All in Ridge Pasture'
    }
];

/**
 * Initialize Database with Mock data if it's empty
 */
async function initializeDatabaseIfEmpty(dbInstance) {
    const cattle = await dbInstance.getAllCattle();
    const tasks = await dbInstance.getAllTasks();

    if (cattle.length === 0) {
        console.log("Database empty. Populating with Glenthorpe cattle data...");
        await dbInstance.bulkSaveCattle(MOCK_CATTLE);
    }
    
    if (tasks.length === 0) {
        console.log("Populating with upcoming Glenthorpe farm tasks...");
        for (const task of MOCK_TASKS) {
            await dbInstance.saveTask(task);
        }
    }

    // Initialize default farm name and pastures in settings
    const farmName = await dbInstance.getSetting('farm_name');
    if (!farmName) {
        await dbInstance.saveSetting('farm_name', 'Glenthorpe Farm');
    }

    const paddocks = await dbInstance.getAllPaddocks();
    if (!paddocks || paddocks.length === 0) {
        await dbInstance.savePaddocks(MOCK_PADDOCKS);
    }
}
