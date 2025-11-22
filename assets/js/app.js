let payoffChartInstance = null;
let currencyRates = null;

const CurrencyConverter = {
    async getRates() {
        if (currencyRates) return currencyRates;
        try {
            const response = await fetch('https://api.exchangerate-api.com/v4/latest/INR');
            if (!response.ok) throw new Error('Failed to fetch currency rates.');
            const data = await response.json();
            currencyRates = data.rates;
            console.log("Currency rates fetched:", currencyRates);
            document.getElementById('currency-display').textContent = `1 USD = ₹${(1 / data.rates.USD).toFixed(2)}`;
            document.getElementById('currency-display').classList.remove('hidden');
            return currencyRates;
        } catch (error) {
            console.error("Currency API Error:", error);
            return { "USD": 0.012, "GBP": 0.0095, "EUR": 0.011, "CAD": 0.016, "AUD": 0.018, "SGD": 0.016, "JPY": 1.8, "AED": 0.044, "INR": 1, "HKD": 0.094, "KRW": 16.5, "BRL": 0.065 };
        }
    }
};

const AIManager = {
    async generateComparativeAnalysis(prompt, isNewToCredit) {
        const apiKey = GOOGLE_AI_API_KEY;
        const explanationDiv = document.getElementById('holistic-ai-explanation');
        if (location.protocol === 'file:' && explanationDiv) {
            explanationDiv.innerHTML = '<div class="text-yellow-300">Open this page via http://localhost (not file://) so AI can run.</div>';
        }
        if (!apiKey) {
            return this.generateStandardExplanation(prompt, isNewToCredit);
        }
        if (!isLikelyValidGoogleKey(apiKey) && explanationDiv) {
            explanationDiv.innerHTML = '<div class="text-red-300">Configured Google API key looks invalid (must start with AIza...). Using standard analysis.</div>';
        }
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_ID}:generateContent?key=${encodeURIComponent(apiKey)}`;
        try {
            // Try official SDK first (browser ESM). If it fails, fall back to REST.
            try {
                const { GoogleGenAI } = await import('https://esm.run/@google/genai');
                const ai = new GoogleGenAI({ apiKey });
                const sdkResp = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.4, topP: 0.95 }
                });
                const sdkText = sdkResp?.text || sdkResp?.output_text;
                if (sdkText) return sdkText;
            } catch (sdkErr) {
                console.warn('SDK call failed, using REST fallback:', sdkErr);
            }

            const response = await fetch(API_URL, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.4, topP: 0.95 }
                })
            });
            if (!response.ok) {
                let errMsg = 'Request failed';
                try { const e = await response.json(); errMsg = e.error?.message || errMsg; } catch { }
                throw new Error(errMsg);
            }
            const data = await response.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            return text || this.generateStandardExplanation(prompt, isNewToCredit);
        } catch (error) {
            console.error('Gemini API Error:', error);
            const explanationDiv = document.getElementById('holistic-ai-explanation');
            if (explanationDiv) {
                explanationDiv.innerHTML = `<div class="text-red-300">AI live explanation unavailable: ${error.message}. Showing standard analysis instead.</div>`;
            }
            return this.generateStandardExplanation(prompt, isNewToCredit);
        }
    },
    generateStandardExplanation(prompt, isNewToCredit) {
        if (isNewToCredit) {
            const topCardMatch = prompt.match(/1\. (.*?) \(Net Value/);
            const topCardName = topCardMatch ? topCardMatch[1] : "This card";
            return `#### Your First Step to Building Credit\nAs you're new to credit, the **${topCardName}** is the perfect starting point. This is a **Secured Credit Card**, which means it's issued against a fixed deposit, guaranteeing approval and eliminating risk for the bank. By using this card for small, regular purchases and paying the bill in full each month, you will begin to build a positive CIBIL history. This is the most important financial step you can take right now to unlock better financial products in the future. The other cards shown are also excellent secured options to begin your credit journey.`;
        }

        const topCardMatch = prompt.match(/1\. (.*?) \(Net Value/);
        const otherCardsMatch = prompt.match(/compare its key reward rates to the other cards \((.*?)\)/);
        const topCardName = topCardMatch ? topCardMatch[1] : "This card";
        const otherCardNames = otherCardsMatch ? otherCardsMatch[1] : "other options";

        const explanation1 = `#### Standard Analysis: Your Top Match\nBased on our data, the **${topCardName}** is an excellent choice for your profile. It provides the strongest overall value by aligning well with your spending habits and financial details. It offers a superior balance of rewards and benefits compared to ${otherCardNames}, making it the most logical recommendation.`;
        const explanation2 = `#### Standard Analysis: A Strong Contender\nThis card is a great alternative, offering solid rewards and benefits that fit well with your profile.`;
        const explanation3 = `#### Standard Analysis: A Solid Option\nThis is another worthwhile card to consider, with valuable perks that could be beneficial for you.`;
        const explanation4 = `#### Standard Analysis: Another Good Choice\nThis card also presents a good value proposition based on your profile.`;
        return `${explanation1}\n\n${explanation2}\n\n${explanation3}\n\n${explanation4}`;
    }
};

const RecommendationEngine = {
    getEligibleCards(profile, allCards, rates) {
        let filteredCards = allCards.filter(card => {
            const incomeInCardCurrency = profile.income * rates[card.Currency];
            return incomeInCardCurrency >= card.MinIncome && profile.credit_score >= card.MinCreditScore;
        });

        if (profile.preferredTiers.length > 0) {
            filteredCards = filteredCards.filter(card => profile.preferredTiers.includes(card.CardTier));
        }
        return filteredCards;
    },
    calculateNetAnnualValue(card, spending, rates) {
        const toINR = 1 / rates[card.Currency];
        const annualFeeInINR = card.AnnualFee * toINR;
        const perksValueInINR = (card.PerksValue || 0) * toINR;
        const annualSpending = Object.keys(spending).reduce((acc, key) => { acc[key] = spending[key] * 12; return acc; }, {});
        let totalRewards = 0;
        const categoryMap = { online_shopping: ['online_shopping', 'online_partners', 'flipkart_myntra', 'amazon_prime'], groceries: ['groceries'], travel: ['travel'], dining: ['dining'], utilities: ['utilities'], fuel: ['fuel'] };
        const defaultRate = card.reward_rates.find(r => r.category === 'default')?.rate || 0.0;
        for (const spendCat in annualSpending) {
            if (spendCat === 'other') continue;
            let rateFound = false;
            const rewardCategories = categoryMap[spendCat] || [];
            for (const rewardCat of rewardCategories) {
                const rateObj = card.reward_rates.find(r => r.category === rewardCat);
                if (rateObj) { totalRewards += annualSpending[spendCat] * rateObj.rate; rateFound = true; break; }
            }
            if (!rateFound) { totalRewards += annualSpending[spendCat] * defaultRate; }
        }
        totalRewards += annualSpending.other * defaultRate;
        const netValue = (totalRewards + perksValueInINR) - annualFeeInINR;
        return { net_value: netValue, breakdown: { "Estimated Annual Rewards": Math.round(totalRewards), "Value of Perks & Benefits": Math.round(perksValueInINR), "Annual Fee": -Math.round(annualFeeInINR) } };
    },
    calculateScores(card, profile, netAnnualValue, maxNav) {
        // NEW: Relative Value Score
        let valueScore = (maxNav > 0) ? (Math.max(0, netAnnualValue) / maxNav) * 10 : 0;

        // NEW: Percentage-based preference boosts
        let boost = 1.0;
        profile.preferences.forEach(pref => {
            if (pref === 'LoungeAccess' && card.LoungeAccess) { boost += 0.15; } // 15% boost
            if (card.RewardCategories.includes(pref)) { boost += 0.1; } // 10% boost
            if (pref === 'Low_Fee' && card.AnnualFee < 500) { boost += 0.1; } // 10% boost
        });

        let customerScore = Math.min(10, valueScore * boost);

        const profitMarginScore = (card.ProfitMargin || 0.05) * 100;
        const creditRiskFactor = (profile.credit_score - 750) / 100;
        const bankScore = Math.max(0, Math.min(10, profitMarginScore + creditRiskFactor));
        return { customer_score: customerScore, bank_score: bankScore };
    },
    runFullAnalysis(profile, allCards, rates) {
        let eligibleCards = this.getEligibleCards(profile, allCards, rates);
        if (!eligibleCards.length) return { recommendations: [], allScoredCards: [] };

        const cardsWithNav = eligibleCards.map(card => {
            const navResult = this.calculateNetAnnualValue(card, profile.spending, rates);
            return { ...navResult, card };
        });

        const maxNav = Math.max(...cardsWithNav.map(c => c.net_value), 1); // Avoid division by zero

        const allScoredCards = cardsWithNav.map(c => {
            const scores = this.calculateScores(c.card, profile, c.net_value, maxNav);
            const nashProduct = scores.customer_score * scores.bank_score;
            return { card: c.card, net_annual_value: c.net_value, breakdown: c.breakdown, scores: { customer_score: parseFloat(scores.customer_score.toFixed(2)), bank_score: parseFloat(scores.bank_score.toFixed(2)), nash_product: parseFloat(nashProduct.toFixed(2)) } };
        });

        const sortedCards = [...allScoredCards].sort((a, b) => {
            if (a.scores.nash_product !== b.scores.nash_product) {
                return b.scores.nash_product - a.scores.nash_product;
            }
            return b.net_annual_value - a.net_annual_value; // Tie-breaker
        });
        return { recommendations: sortedCards.slice(0, 4), allScoredCards }; // Return top 4
    }
};

document.addEventListener('DOMContentLoaded', () => {
    anime({ targets: '#main-header', translateY: [-20, 0], opacity: [0, 1], duration: 800, easing: 'easeOutExpo' });
    CurrencyConverter.getRates();

    const noCreditCheckbox = document.getElementById('no-credit-history');
    const creditScoreInput = document.getElementById('credit-score');
    noCreditCheckbox.addEventListener('change', () => {
        if (noCreditCheckbox.checked) {
            creditScoreInput.value = 300;
            creditScoreInput.disabled = true;
        } else {
            creditScoreInput.disabled = false;
            creditScoreInput.value = 780;
        }
    });

    // Sidebar Logic
    const browseBtn = document.getElementById('browse-cards-btn');
    const closeSidebarBtn = document.getElementById('close-sidebar-btn');
    const sidebar = document.getElementById('sidebar');

    // Initialize sidebar when browse button is clicked
    browseBtn.addEventListener('click', async () => {
        console.log('Browse button clicked, initializing sidebar...');
        try {
            await initializeSidebar();
            sidebar.classList.remove('translate-x-full');
        } catch (error) {
            console.error('Error initializing sidebar:', error);
        }
    });

    closeSidebarBtn.addEventListener('click', () => {
        sidebar.classList.add('translate-x-full');
    });

    document.getElementById('tier-filter').addEventListener('change', updateSidebarFilters);
    document.getElementById('issuer-filter').addEventListener('change', updateSidebarFilters);
    document.getElementById('country-filter').addEventListener('change', updateSidebarFilters);
});

document.getElementById('recommendation-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    const loading = document.getElementById('loading-indicator');
    loading.classList.remove('hidden');

    // Start loading animation
    anime({
        targets: '#card-base',
        translateX: [{ value: -10, duration: 400 }, { value: 10, duration: 400 }, { value: 0, duration: 400 }],
        rotateY: [{ value: -10, duration: 600 }, { value: 0, duration: 600 }],
        easing: 'easeInOutSine',
        loop: true,
        direction: 'alternate'
    });

    const errorDiv = document.getElementById('error-message');
    const resultsSection = document.getElementById('results-section');
    errorDiv.classList.add('hidden');
    resultsSection.classList.add('hidden');
    try {
        const rates = await CurrencyConverter.getRates();
        const allCards = await GlobalCardAPI.fetchAllCards();
        if (allCards.length === 0) return; // Stop if DB failed to load

        const userProfile = {
            income: parseInt(document.getElementById('income').value) || 0,
            credit_score: parseInt(document.getElementById('credit-score').value) || 300,
            spending: { groceries: parseInt(document.getElementById('groceries').value) || 0, online_shopping: parseInt(document.getElementById('online_shopping').value) || 0, travel: parseInt(document.getElementById('travel').value) || 0, dining: parseInt(document.getElementById('dining').value) || 0, utilities: parseInt(document.getElementById('utilities').value) || 0, fuel: parseInt(document.getElementById('fuel').value) || 0, other: parseInt(document.getElementById('other').value) || 0, },
            preferences: Array.from(document.querySelectorAll('input[name="preferences"]:checked')).map(cb => cb.value),
            preferredTiers: Array.from(document.querySelectorAll('input[name="preferredTiers"]:checked')).map(cb => cb.value),
            isNewToCredit: document.getElementById('no-credit-history').checked
        };
        const { recommendations, allScoredCards } = RecommendationEngine.runFullAnalysis(userProfile, allCards, rates);
        if (recommendations.length === 0) {
            errorDiv.innerText = "😞 We couldn't find any suitable cards for your profile. Please try adjusting your income or credit score.";
            errorDiv.classList.remove('hidden');
        } else {
            await displayRecommendations(recommendations, userProfile);
            displayGameTheoryVisuals(allScoredCards, recommendations.map(r => r.card.CardName));
            resultsSection.classList.remove('hidden');
        }
    } catch (error) {
        console.error("Calculation failed:", error);
        errorDiv.innerText = `⚠️ An unexpected error occurred during calculation. Please check your inputs or network connection.`;
        errorDiv.classList.remove('hidden');
    } finally {
        loading.classList.add('hidden');
        anime.remove('#card-base'); // Stop animation
    }
});

async function displayRecommendations(recommendations, profile) {
    const container = document.getElementById('results-container');
    container.innerHTML = '';
    recommendations.forEach((rec, index) => { container.innerHTML += createCardHtml(rec, index); });

    anime({ targets: '.card-container', translateY: [20, 0], opacity: [0, 1], delay: anime.stagger(100, { from: 'first' }), easing: 'easeOutExpo' });

    const prompt = createComparativePromptForAI(recommendations, profile);
    const fullExplanation = await AIManager.generateComparativeAnalysis(prompt, profile.isNewToCredit);

    const explanationDiv = document.getElementById('holistic-ai-explanation');
    const parseMarkdown = (md) => {
        try { return (window.marked?.parse ? window.marked.parse(md) : window.marked ? window.marked(md) : md); } catch { return md; }
    };
    explanationDiv.innerHTML = parseMarkdown(fullExplanation);
}

function displayGameTheoryVisuals(allScoredCards, recommendedCardNames) {
    const sortedForTable = [...allScoredCards].sort((a, b) => b.scores.nash_product - a.scores.nash_product);
    populatePayoffTable(sortedForTable, recommendedCardNames);
    // Reverted to show ALL eligible cards in the chart
    updatePayoffChart(sortedForTable, recommendedCardNames);
}

function createComparativePromptForAI(recommendations, profile) {
    const topSpending = Object.entries(profile.spending).sort(([, a], [, b]) => b - a).slice(0, 2).map(([cat, val]) => `${cat.replace('_', ' ')} (₹${val.toLocaleString('en-IN')}/month)`).join(' and ');
    const topCard = recommendations[0];
    const otherCards = recommendations.slice(1);
    let prompt = `You are an expert financial advisor in India providing a single, holistic comparative analysis for a user.
    The user's profile: Annual income of ₹${profile.income.toLocaleString('en-IN')}, credit score of ${profile.credit_score}, and top spending areas in ${topSpending}.
    
    Here are the top 4 recommendations:
    1. ${topCard.card.CardName} (Net Value: ₹${Math.round(topCard.net_annual_value).toLocaleString('en-IN')})
    ${otherCards.map((rec, i) => `${i + 2}. ${rec.card.CardName} (Net Value: ₹${Math.round(rec.net_annual_value).toLocaleString('en-IN')})`).join('\n')}

    Your task is to generate a single, cohesive explanation.
    - Start with a "#### Top Recommendation" section for the #1 card, "${topCard.card.CardName}". Explain in detail why it is the absolute best choice. Directly compare its key reward rates to the other cards, showing how it specifically maximizes value on the user's top spending.
    - Then, create a "#### Other Strong Options" section. For each of the other 3 cards, write a very brief (1-2 sentences) summary of its main strength and why it's a good, but not the best, alternative for this specific user.
    - Conclude with a final sentence that builds trust in this data-driven comparative recommendation.
    - Format the entire response in simple markdown. Use bolding for emphasis.`;
    return prompt.trim();
}

function createCardHtml(rec, index) {
    const isRecommended = index === 0;
    const card = rec.card;
    const nav = rec.net_annual_value;
    const badgeHtml = isRecommended ? `<div class="absolute top-0 right-4 -mt-4 recommended-badge text-white text-sm font-bold px-4 py-1 rounded-full shadow-lg">Top Match</div>` : '';

    const tierStyles = {
        "Entry-Level": { color: "bg-gradient-to-br from-slate-500 to-slate-700", icon: `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 1 1 0 000-2z" clip-rule="evenodd" /></svg>` },
        "Standard": { color: "bg-gradient-to-br from-sky-500 to-sky-700", icon: `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>` },
        "Premium": { color: "bg-gradient-to-br from-indigo-500 to-indigo-700", icon: `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor"><path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 01-1.162-.682 22.045 22.045 0 01-2.582-1.9-22.045 22.045 0 01-2.582-1.9A20.759 20.759 0 013 12.499V8.332a2 2 0 01.88-1.664l5.5-3.333a2 2 0 012.24 0l5.5 3.333A2 2 0 0117 8.332v4.167c0 .622-.182 1.222-.504 1.768a20.758 20.758 0 01-1.162.682 22.049 22.049 0 01-2.582 1.9 22.049 22.049 0 01-2.582 1.9l-.019.01-.005.003h-.002z" /></svg>` },
        "Super-Premium": { color: "bg-gradient-to-br from-purple-600 to-pink-600", icon: `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor"><path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" /></svg>` }
    };
    const tierStyle = tierStyles[card.CardTier] || { color: "bg-gray-500", icon: "" };
    const tierTagHtml = `<div class="absolute bottom-0 right-4 transform translate-y-1/2 ${tierStyle.color} text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg flex items-center">${tierStyle.icon}<span>${card.CardTier}</span></div>`;

    return `<div class="card-container flex flex-col glass-container border ${isRecommended ? 'border-indigo-400' : 'border-white/20'} rounded-2xl shadow-lg p-6 relative" style="transform-style: preserve-3d;"> ${badgeHtml} <div class="text-center"> <h3 class="text-xl font-bold text-shadow">${card.CardName}</h3> <p class="text-xs text-indigo-200">${card.RewardCategories.join(' • ')}</p> </div> <div class="my-4 text-center"> <p class="text-sm">Estimated Net Annual Value</p> <p class="text-3xl font-extrabold ${nav >= 0 ? 'text-green-400' : 'text-red-400'}">₹${Math.round(nav).toLocaleString('en-IN')}</p> </div> <div class="space-y-2 text-sm flex-grow flex flex-col"> <div class="breakdown bg-black/20 p-3 rounded-lg"> <p class="font-semibold mb-2">Value Breakdown:</p> <dl class="grid grid-cols-[auto,1fr] gap-x-4"> <dt>Annual Rewards:</dt><dd class="font-medium text-green-400 text-right">+ ₹${rec.breakdown['Estimated Annual Rewards'].toLocaleString('en-IN')}</dd> <dt>Perks & Benefits:</dt><dd class="font-medium text-green-400 text-right">+ ₹${rec.breakdown['Value of Perks & Benefits'].toLocaleString('en-IN')}</dd> <dt>Annual Fee:</dt><dd class="font-medium text-red-400 text-right"> ${rec.breakdown['Annual Fee'].toLocaleString('en-IN')}</dd> </dl> </div> </div> ${tierTagHtml} </div>`;
}

function populatePayoffTable(allScoredCards, recommendedCardNames) {
    const tableBody = document.getElementById('payoff-table-body');
    tableBody.innerHTML = '';
    allScoredCards.forEach(rec => {
        const row = tableBody.insertRow();
        if (recommendedCardNames.includes(rec.card.CardName)) {
            row.classList.add('bg-indigo-500/20', 'font-semibold');
        }
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm">${rec.card.CardName}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${rec.scores.customer_score.toFixed(2)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${rec.scores.bank_score.toFixed(2)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${rec.scores.nash_product.toFixed(2)}</td>
        `;
    });
}

function updatePayoffChart(cardsForChart, recommendedCardNames) {
    const ctx = document.getElementById('payoffChart').getContext('2d');
    if (payoffChartInstance) { payoffChartInstance.destroy(); }
    const labels = cardsForChart.map(rec => rec.card.CardName);
    const customerScores = cardsForChart.map(rec => rec.scores.customer_score);
    const bankScores = cardsForChart.map(rec => rec.scores.bank_score);
    const nashProducts = cardsForChart.map(rec => rec.scores.nash_product);
    const backgroundColors = cardsForChart.map(rec => recommendedCardNames.includes(rec.card.CardName) ? '#818cf8' : '#4f46e5');
    payoffChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Customer Score', data: customerScores, backgroundColor: backgroundColors.map(c => c === '#818cf8' ? '#a5b4fc' : '#6366f1'), borderWidth: 1 },
                { label: 'Bank Score', data: bankScores, backgroundColor: backgroundColors.map(c => c === '#818cf8' ? '#818cf8' : '#4f46e5'), borderWidth: 1 },
                { label: 'Nash Product', data: nashProducts, backgroundColor: backgroundColors, borderWidth: 1 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { title: { display: true, text: 'All Eligible Cards by Game Theory Score', color: 'white' }, tooltip: { mode: 'index', intersect: false } }, scales: { x: { stacked: false, beginAtZero: true, title: { display: true, text: 'Scores', color: 'white' }, ticks: { color: 'white' } }, y: { stacked: false, ticks: { autoSkip: false, color: 'white' } } } }
    });
}

function resetApp() {
    document.getElementById('recommendation-form').reset();
    document.getElementById('results-section').classList.add('hidden');
    document.getElementById('error-message').classList.add('hidden');
    if (payoffChartInstance) { payoffChartInstance.destroy(); payoffChartInstance = null; }
    window.scrollTo(0, 0);
}

// Add hover animations for cards
document.addEventListener('mouseover', function (e) {
    if (e.target.closest('.card-container')) {
        const card = e.target.closest('.card-container');
        anime({ targets: card, scale: 1.03, duration: 300, easing: 'easeOutQuad' });
    }
});
document.addEventListener('mouseout', function (e) {
    if (e.target.closest('.card-container')) {
        const card = e.target.closest('.card-container');
        anime({ targets: card, scale: 1, duration: 300, easing: 'easeOutQuad' });
    }
});

// --- Sidebar and Modal Logic ---
let allCardsCache = [];

async function initializeSidebar() {
    console.log('Initializing sidebar...');
    try {
        console.log('Fetching cards from GlobalCardAPI...');
        allCardsCache = await GlobalCardAPI.fetchAllCards();
        console.log(`Fetched ${allCardsCache.length} cards`);

        // Debug: Log first few cards
        console.log('Sample cards:', allCardsCache.slice(0, 3));

        // Initialize filters
        console.log('Updating sidebar filters...');
        updateSidebarFilters();

        // Add event listeners for filters
        console.log('Adding filter event listeners...');
        const tierFilter = document.getElementById('tier-filter');
        const issuerFilter = document.getElementById('issuer-filter');
        const countryFilter = document.getElementById('country-filter');

        if (!tierFilter || !issuerFilter || !countryFilter) {
            console.error('One or more filter elements not found:', {
                tierFilter: !!tierFilter,
                issuerFilter: !!issuerFilter,
                countryFilter: !!countryFilter
            });
        } else {
            tierFilter.addEventListener('change', updateSidebarFilters);
            issuerFilter.addEventListener('change', updateSidebarFilters);
            countryFilter.addEventListener('change', updateSidebarFilters);
            console.log('Filter event listeners added');
        }

        console.log('Sidebar initialization complete');
    } catch (error) {
        console.error('Error initializing sidebar:', error);
        // Try to show error in UI if possible
        const list = document.getElementById('sidebar-card-list');
        if (list) {
            list.innerHTML = `
                <div class="text-red-400 p-4">
                    <p class="font-bold">Error loading card database</p>
                    <p class="text-sm mt-1">${error.message || 'Unknown error'}</p>
                </div>`;
        }
    }
}

function updateSidebarFilters() {
    console.log('Updating sidebar filters...');
    try {
        const tierEl = document.getElementById('tier-filter');
        const issuerEl = document.getElementById('issuer-filter');
        const countryEl = document.getElementById('country-filter');

        if (!tierEl || !issuerEl || !countryEl) {
            throw new Error('One or more filter elements not found');
        }

        const tier = tierEl.value;
        const issuer = issuerEl.value;
        const country = countryEl.value;

        console.log('Current filter values:', { tier, issuer, country });

        if (!allCardsCache || allCardsCache.length === 0) {
            console.warn('No cards in cache to filter');
            populateCardList([]);
            return;
        }

        let filteredCards = [...allCardsCache]; // Create a copy to avoid modifying the original

        if (tier && tier !== 'All Tiers') {
            filteredCards = filteredCards.filter(card => card.CardTier === tier);
            console.log(`Filtered by tier '${tier}': ${filteredCards.length} cards remaining`);
        }
        if (issuer && issuer !== 'All Issuers') {
            filteredCards = filteredCards.filter(card => card.Issuer === issuer);
            console.log(`Filtered by issuer '${issuer}': ${filteredCards.length} cards remaining`);
        }
        if (country && country !== 'All Countries') {
            filteredCards = filteredCards.filter(card => card.Country === country);
            console.log(`Filtered by country '${country}': ${filteredCards.length} cards remaining`);
        }

        console.log(`Displaying ${filteredCards.length} cards after filtering`);
        populateCardList(filteredCards);

        // Update other filters based on the current selection
        updateFilterOptions(tier, issuer, country);

    } catch (error) {
        console.error('Error in updateSidebarFilters:', error);
        const list = document.getElementById('sidebar-card-list');
        if (list) {
            list.innerHTML = `
                <div class="text-red-400 p-4">
                    <p class="font-bold">Error applying filters</p>
                    <p class="text-sm mt-1">${error.message || 'Please try again'}</p>
                </div>`;
        }
    }
}

function updateFilterOptions(selectedTier, selectedIssuer, selectedCountry) {
    console.log('Updating filter options with:', { selectedTier, selectedIssuer, selectedCountry });
    try {
        if (!allCardsCache || allCardsCache.length === 0) {
            console.warn('No cards in cache to update filter options');
            return;
        }

        let tempFiltered;

        // Update Issuer options
        tempFiltered = [...allCardsCache];
        if (selectedTier && selectedTier !== 'All Tiers') {
            tempFiltered = tempFiltered.filter(c => c.CardTier === selectedTier);
        }
        if (selectedCountry && selectedCountry !== 'All Countries') {
            tempFiltered = tempFiltered.filter(c => c.Country === selectedCountry);
        }

        const issuers = [...new Set(tempFiltered.map(c => c.Issuer).filter(Boolean))].sort();
        console.log('Updating issuer dropdown with options:', issuers);
        populateSelectWithOptions('issuer-filter', issuers, selectedIssuer, 'All Issuers');

        // Update Country options
        tempFiltered = [...allCardsCache];
        if (selectedTier && selectedTier !== 'All Tiers') {
            tempFiltered = tempFiltered.filter(c => c.CardTier === selectedTier);
        }
        if (selectedIssuer && selectedIssuer !== 'All Issuers') {
            tempFiltered = tempFiltered.filter(c => c.Issuer === selectedIssuer);
        }

        const countries = [...new Set(tempFiltered.map(c => c.Country).filter(Boolean))].sort();
        console.log('Updating country dropdown with options:', countries);
        populateSelectWithOptions('country-filter', countries, selectedCountry, 'All Countries');

    } catch (error) {
        console.error('Error in updateFilterOptions:', error);
        // Don't show error to user as it might be non-critical
    }
}

function populateSelectWithOptions(selectId, options, selectedValue, defaultOptionText) {
    try {
        console.log(`Populating ${selectId} with ${options.length} options, selected: ${selectedValue}`);
        const select = document.getElementById(selectId);

        if (!select) {
            throw new Error(`Select element with ID '${selectId}' not found`);
        }

        if (!Array.isArray(options)) {
            console.warn(`Options for ${selectId} is not an array:`, options);
            options = [];
        }

        // Save the current value to restore it after updating options
        const currentValue = select.value;

        // Clear existing options
        select.innerHTML = '';

        // Add default option
        if (defaultOptionText) {
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = defaultOptionText;
            select.appendChild(defaultOption);
        }

        // Add all options
        options.forEach(optionText => {
            if (optionText) { // Skip null/undefined options
                const option = document.createElement('option');
                option.value = optionText;
                option.textContent = optionText;
                select.appendChild(option);
            }
        });

        // Try to restore the selected value if it's still valid
        if (selectedValue && options.includes(selectedValue)) {
            select.value = selectedValue;
        } else if (currentValue && options.includes(currentValue)) {
            select.value = currentValue;
        } else if (defaultOptionText) {
            select.selectedIndex = 0; // Select the default option
        }

        console.log(`Finished populating ${selectId}, selected value: ${select.value}`);

    } catch (error) {
        console.error(`Error in populateSelectWithOptions for ${selectId}:`, error);
        // Try to show error in the select if possible
        const select = document.getElementById(selectId);
        if (select) {
            select.innerHTML = `
                <option value="" disabled selected>Error loading options</option>
                <option value="">Refresh page</option>
            `;
        }
    }
}

function populateCardList(cards) {
    try {
        console.log('Populating card list with', cards.length, 'cards');
        const list = document.getElementById('sidebar-card-list');
        if (!list) {
            console.error('sidebar-card-list element not found');
            return;
        }

        list.innerHTML = '';

        if (!cards || cards.length === 0) {
            list.innerHTML = '<p class="text-center text-gray-400 py-4">No cards found matching the selected filters</p>';
            return;
        }

        cards.forEach(card => {
            try {
                const cardEl = document.createElement('div');
                cardEl.className = 'p-3 border border-white/20 bg-white/10 rounded-lg flex justify-between items-center mb-3';
                cardEl.innerHTML = `
                    <div>
                        <p class="font-bold">${card.CardName || 'Unnamed Card'}</p>
                        <p class="text-sm text-indigo-200">${card.CardTier || 'N/A'} • ${card.Issuer || 'N/A'}</p>
                    </div>
                    <button class="view-details-btn bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-1 px-3 rounded-md transition-colors">
                        View Details
                    </button>
                `;

                const viewBtn = cardEl.querySelector('.view-details-btn');
                if (viewBtn) {
                    viewBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        showCardDetails(card);
                    });
                }

                list.appendChild(cardEl);
            } catch (error) {
                console.error('Error creating card element:', error, card);
            }
        });

        console.log('Finished populating card list');
    } catch (error) {
        console.error('Error in populateCardList:', error);
        const list = document.getElementById('sidebar-card-list');
        if (list) {
            list.innerHTML = `
                <div class="text-center text-red-400 p-4">
                    <p>Error loading cards. Please try again.</p>
                    <p class="text-xs mt-2">${error.message}</p>
                </div>`;
        }
    }
}

async function generateCardAnalysis(card) {
    // Simulate AI analysis - in a real app, this would call an AI API
    const benefits = [
        `The ${card.CardName} offers excellent value for ${card.RewardCategories?.join(' and ')} spending.`,
        `With a ${card.AnnualFee === 0 ? 'no annual fee' : 'reasonable annual fee'}, this card is perfect for ${card.MinIncome > 50000 ? 'premium' : 'everyday'} spenders.`,
        card.LoungeAccess ? 'Includes premium lounge access at airports worldwide.' : '',
        `Earn up to ${Math.max(...card.reward_rates.map(r => r.rate)) * 100}% back on select categories.`
    ].filter(Boolean).join(' ');

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));

    return `
        <div class="mt-6 pt-4 border-t border-white/20">
            <h4 class="font-bold text-sm mb-2 flex items-center">
                <svg class="w-4 h-4 mr-2 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                </svg>
                AI-Powered Analysis
            </h4>
            <div class="text-sm text-gray-200 leading-relaxed">
                <p>${benefits}</p>
                <p class="mt-2">Based on your profile and spending habits, this card could help you maximize rewards in your highest spending categories.</p>
            </div>
        </div>
    `;
}

let currentCard = null;
let currentCvv = '';

// Helper function to format currency based on card country
function formatCurrency(amount, country) {
    if (!amount && amount !== 0) return 'N/A';

    const formatter = new Intl.NumberFormat(
        country === 'IN' ? 'en-IN' : 'en-US',
        {
            style: 'currency',
            currency: country === 'IN' ? 'INR' : 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }
    );

    return formatter.format(amount);
}

async function showCardDetails(card) {
    try {
        console.log('Showing card details for:', card.CardName);
        currentCard = card; // Store the current card for AI analysis
        const modal = document.getElementById('card-modal');
        const modalContent = document.getElementById('modal-content');

        if (!modal || !modalContent) {
            throw new Error('Modal elements not found');
        }

        // Show the modal
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        document.body.style.overflow = 'hidden'; // Prevent scrolling when modal is open

        // Generate rewards HTML
        let rewardsHtml = '';
        if (card.reward_rates && Array.isArray(card.reward_rates)) {
            rewardsHtml = card.reward_rates.map(rate => `
                <div class="flex justify-between">
                    <dt class="text-indigo-200">${String(rate.category || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</dt>
                    <dd class="font-medium">${(rate.rate || 0) * 100}%</dd>
                </div>
            `).join('');
        } else {
            rewardsHtml = '<p class="text-gray-400">No reward rates available</p>';
        }


        // Create modal content with front and back views
        modalContent.innerHTML = `
            <div class="bg-gradient-to-br from-indigo-900 to-indigo-950 rounded-2xl p-6 shadow-2xl max-w-2xl w-full mx-4 relative overflow-hidden">
            
            <!-- Front of Card -->
            <div id="card-front" class="transition-all duration-300 cursor-pointer">
                <div class="flex flex-col h-full">
                    <div class="flex justify-between items-start mb-4">
                        <div class="flex items-center gap-3">
                            <img src="https://logo.clearbit.com/${(card.Issuer || '').toLowerCase()}.com" 
                                 onerror="this.src='https://via.placeholder.com/40/1e1b4b/7e22ce?text='+encodeURIComponent((''+(card.Issuer||'')).charAt(0))" 
                                 class="h-10 w-10 rounded-full object-cover border border-indigo-500/30" 
                                 alt="${card.Issuer || ''} logo">
                            <div>
                                <h2 class="text-xl font-bold text-white">${card.CardName || 'Credit Card'}</h2>
                                <div class="flex items-center gap-2 text-xs text-indigo-300">
                                    <span class="px-2 py-0.5 bg-indigo-800/50 rounded-full">${card.Tier || 'Standard'}</span>
                                    <span>${card.Country || 'IN'}</span>
                                </div>
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="text-xs text-indigo-300">Annual Fee</div>
                            <div class="text-base font-semibold text-white">${!card.AnnualFee && card.AnnualFee !== 0 ? 'N/A' : card.AnnualFee === 0 ? 'Free' : formatCurrency(card.AnnualFee, card.Country)}</div>
                        </div>
                    </div>

                    <!-- Card Number -->
                    <div class="mt-4 p-4 bg-gradient-to-r from-indigo-800/40 to-indigo-900/40 rounded-lg border border-indigo-700/50">
                        <div class="flex justify-between items-center">
                            <div class="text-indigo-200 text-sm">Card Number</div>
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        </div>
                        <div class="text-white text-lg font-mono mt-1">•••• •••• •••• ${Math.floor(1000 + Math.random() * 9000)}</div>
                        <div class="text-indigo-300 text-xs mt-2 flex justify-between">
                            <span>Click to view AI analysis</span>
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                            </svg>
                        </div>
                    </div>

                    <!-- Card Details -->
                    <div class="grid grid-cols-2 gap-4 mt-6">
                        <div>
                            <h3 class="text-xs font-medium text-indigo-300 mb-1">Min. Income</h3>
                            <p class="text-white text-sm">${formatCurrency(card.MinIncome, card.Country)}</p>
                        </div>
                        <div>
                            <h3 class="text-xs font-medium text-indigo-300 mb-1">Foreign Fee</h3>
                            <p class="text-white text-sm">${card.ForeignTransactionFee ? (card.ForeignTransactionFee * 100) + '%' : 'None'}</p>
                        </div>
                    </div>

                    <!-- Reward Rates -->
                    <div class="mt-4">
                        <h3 class="text-xs font-medium text-indigo-300 mb-2">Reward Rates</h3>
                        <dl class="space-y-1.5">
                            ${rewardsHtml}
                        </dl>
                    </div>
                </div>
            </div>
            
            <!-- Back of Card (initially hidden) -->
            <div id="card-back" class="hidden transition-all duration-300">
                <div class="bg-gradient-to-r from-indigo-900 to-indigo-800 p-6 rounded-xl h-full flex flex-col">
                    <div class="flex justify-between items-center mb-6">
                        <button id="back-to-front" class="text-indigo-300 hover:text-white transition-colors flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Back to Card
                        </button>
                        <span class="text-sm text-indigo-400">AI Analysis</span>
                    </div>
                    
                    <!-- AI Analysis Loading Placeholder -->
                    <div id="ai-analysis-container" class="flex-1 flex items-center justify-center">
                        <div class="text-center">
                            <div class="animate-pulse flex space-x-2 justify-center">
                                <div class="w-2 h-2 bg-indigo-400 rounded-full"></div>
                                <div class="w-2 h-2 bg-indigo-500 rounded-full"></div>
                                <div class="w-2 h-2 bg-indigo-600 rounded-full"></div>
                            </div>
                            <p class="mt-2 text-sm text-indigo-300">Generating AI analysis...</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

        // Make the entire card clickable for showing AI analysis
        const cardFront = modalContent.querySelector('#card-front');
        if (cardFront) {
            cardFront.addEventListener('click', () => {
                const cardBack = modalContent.querySelector('#card-back');
                if (cardBack) {
                    cardFront.classList.add('hidden');
                    cardBack.classList.remove('hidden');
                    // Generate AI analysis when showing the back
                    generateCardAnalysis(card);
                }
            });
        }

        // Close modal when clicking outside the modal content

        // Show card back button
        const showBackBtn = modalContent.querySelector('#show-card-back');
        if (showBackBtn) {
            showBackBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const cardFront = document.getElementById('card-front');
                const cardBack = document.getElementById('card-back');
                if (cardFront && cardBack) {
                    cardFront.classList.add('hidden');
                    cardBack.classList.remove('hidden');
                }
            });
        }

        // Back to front button
        const backToFrontBtn = modalContent.querySelector('#back-to-front');
        if (backToFrontBtn) {
            backToFrontBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const cardFront = document.getElementById('card-front');
                const cardBack = document.getElementById('card-back');
                if (cardFront && cardBack) {
                    cardFront.classList.remove('hidden');
                    cardBack.classList.add('hidden');
                }
            });
        }

        // Generate AI analysis in the background
        generateCardAnalysis(card)
            .then(analysis => {
                const aiContainer = document.getElementById('ai-analysis-container');
                if (aiContainer) {
                    aiContainer.innerHTML = analysis;
                }
            })
            .catch(error => {
                console.error('Error generating AI analysis:', error);
                const aiContainer = document.getElementById('ai-analysis-container');
                if (aiContainer) {
                    aiContainer.innerHTML = `
                        <div class="text-center text-red-400">
                            <p>Failed to load AI analysis. Please try again.</p>
                        </div>`;
                }
            });

    } catch (error) {
        console.error('Error showing card details:', error);
        // Show error to user
        const modalContent = document.getElementById('modal-content');
        if (modalContent) {
            modalContent.innerHTML = `
                <div class="bg-gradient-to-br from-red-900 to-red-950 rounded-2xl p-6 shadow-2xl max-w-2xl w-full mx-4 relative overflow-hidden">
                    <h2 class="text-xl font-bold text-white mb-4">Error Loading Card Details</h2>
                    <p class="text-red-200">${error.message || 'An error occurred while loading card details.'}</p>
                    <button id="close-modal-btn" class="mt-4 px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-md transition-colors">
                        Close
                    </button>
                </div>`;

            // Add close button event listener
            const closeBtn = modalContent.querySelector('#close-modal-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', closeModal);
            }
        }
    }
}

// Initialize event listeners
document.addEventListener('DOMContentLoaded', () => {
    const browseBtn = document.getElementById('browse-cards-btn');
    const closeSidebarBtn = document.getElementById('close-sidebar-btn');
    const sidebar = document.getElementById('sidebar');
    const modal = document.getElementById('card-modal');

    // Sidebar toggle
    if (browseBtn) {
        browseBtn.addEventListener('click', () => {
            console.log('Browse button clicked');
            if (sidebar) {
                console.log('Sidebar found, removing translate-x-full class');
                sidebar.classList.remove('translate-x-full');
                // Force reflow to ensure the transition works
                void sidebar.offsetWidth;
                // Initialize or refresh the card list when opening the sidebar
                if (allCardsCache.length === 0) {
                    console.log('No cards in cache, initializing sidebar');
                    initializeSidebar();
                } else {
                    console.log('Refreshing card list with', allCardsCache.length, 'cached cards');
                    updateSidebarFilters();
                }
            } else {
                console.error('Sidebar element not found');
            }
        });
    }

    // Close sidebar
    if (closeSidebarBtn && sidebar) {
        closeSidebarBtn.addEventListener('click', () => {
            sidebar.classList.add('translate-x-full');
        });
    }

    // Close modal function - defined in global scope
    window.closeModal = function () {
        console.log('Closing modal...');
        const modal = document.getElementById('card-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            document.body.style.overflow = 'auto'; // Re-enable scrolling
            // Reset to front view when closing
            const cardFront = document.getElementById('card-front');
            const cardBack = document.getElementById('card-back');
            if (cardFront && cardBack) {
                cardFront.classList.remove('hidden');
                cardBack.classList.add('hidden');
            }
        }
    };

    // Click handler for modal interactions
    document.addEventListener('click', (e) => {
        const modal = document.getElementById('card-modal');
        const modalContent = modal ? modal.querySelector('.bg-gradient-to-br') : null;

        // Close modal when clicking outside the modal content
        if (modal && modalContent && e.target === modal) {
            closeModal();
        }
    });

    // Close with Escape key
    document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('card-modal');
        if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
            closeModal();
        }
    });

    // Initialize filters
    const tierFilter = document.getElementById('tier-filter');
    const issuerFilter = document.getElementById('issuer-filter');
    const countryFilter = document.getElementById('country-filter');

    if (tierFilter) tierFilter.addEventListener('change', updateSidebarFilters);
    if (issuerFilter) issuerFilter.addEventListener('change', updateSidebarFilters);
    if (countryFilter) countryFilter.addEventListener('change', updateSidebarFilters);
});
