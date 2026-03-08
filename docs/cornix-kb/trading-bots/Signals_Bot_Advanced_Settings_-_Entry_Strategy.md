# Signals Bot Advanced Settings - Entry Strategy

**URL:** https://help.cornix.io/en/articles/8976601-signals-bot-advanced-settings-entry-strategy

**Created:** 2026-03-03T11:47:07+00:00

---

Signals Bot Advanced Settings - Entry Strategy | Cornix Help Center- - - - - - :root{--body-bg: rgb(255, 255, 255);
--body-image: none;
--body-bg-rgb: 255, 255, 255;
--body-border: rgb(230, 230, 230);
--body-primary-color: #1a1a1a;
--body-secondary-color: #737373;
--body-reaction-bg: rgb(242, 242, 242);
--body-reaction-text-color: rgb(64, 64, 64);
--body-toc-active-border: #737373;
--body-toc-inactive-border: #f2f2f2;
--body-toc-inactive-color: #737373;
--body-toc-active-font-weight: 400;
--body-table-border: rgb(204, 204, 204);
--body-color: hsl(0, 0%, 0%);
--footer-bg: rgb(255, 255, 255);
--footer-image: none;
--footer-border: rgb(230, 230, 230);
--footer-color: hsl(211, 10%, 61%);
--header-bg: none;
--header-image: url(https://downloads.intercomcdn.com/i/o/wrsw0nb0/663084/8cd5c29e4b01ccfff3d54c7bd01a/bcb02057784c6c6a633cd138e02ffe33.jpg);
--header-color: hsl(242, 64%, 18%);
--collection-card-bg: rgb(242, 242, 255);
--collection-card-image: none;
--collection-card-color: hsl(201, 97%, 41%);
--card-bg: rgb(255, 255, 255);
--card-border-color: rgb(230, 230, 230);
--card-border-inner-radius: 8px;
--card-border-radius: 10px;
--card-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
--search-bar-border-radius: 10px;
--search-bar-width: 100%;
--ticket-blue-bg-color: #dce1f9;
--ticket-blue-text-color: #334bfa;
--ticket-green-bg-color: #d7efdc;
--ticket-green-text-color: #0f7134;
--ticket-orange-bg-color: #ffebdb;
--ticket-orange-text-color: #b24d00;
--ticket-red-bg-color: #ffdbdb;
--ticket-red-text-color: #df2020;
--header-height: 245px;
--header-subheader-background-color: #000000;
--header-subheader-font-color: #FFFFFF;
--content-block-bg: rgb(255, 255, 255);
--content-block-image: none;
--content-block-color: hsl(0, 0%, 10%);
--content-block-button-bg: rgb(51, 75, 250);
--content-block-button-image: none;
--content-block-button-color: hsl(0, 0%, 100%);
--content-block-button-radius: 6px;
--content-block-margin: 0;
--content-block-width: auto;
--primary-color: hsl(242, 64%, 18%);
--primary-color-alpha-10: hsla(242, 64%, 18%, 0.1);
--primary-color-alpha-60: hsla(242, 64%, 18%, 0.6);
--text-on-primary-color: #ffffff}Skip to main content
DashboardAnnouncements ChannelEnglish
English
DashboardAnnouncements ChannelEnglish
English
Search for articles...
Table of contents
Channel vs. Personal'Channel' 'Personal''Only use if not defined by group'Entries RatiosBuilt-inCustomDCAEntries PricesMax Number of OrdersTrailingFirst Entry as Market- All Collections
- Trading Bots
- Signals
- Signals Bots Advanced Settings
- Signals Bot Advanced Settings - Entry Strategy
# Signals Bot Advanced Settings - Entry Strategy
How to set your own entry strategy to override the signals channel settings
Written by Hadar Cornix Updated over 3 months agoTable of contents
Channel vs. Personal'Channel' 'Personal''Only use if not defined by group'Entries RatiosBuilt-inCustomDCAEntries PricesMax Number of OrdersTrailingFirst Entry as Market
# Channel vs. Personal
## 'Channel'
While the 'Channel' toggle is enabled, the specified Entries configuration for each trade will be determined dynamically based on the signal and channel settings.

## 'Personal'
Configure your own Entry strategy by choosing the 'Personal' option. You can override the signal's entry orders ratios, prices, number of orders, number of active orders, trailing entry, and enable the 'First Entry as Market' feature.

## 'Only use if not defined by group'
Selecting the "Only use if not defined by group" checkbox will enable the chosen parameter value only when the parameter is not specified in the group configuration or in the posted signal. If the parameter is defined in the signal or group configuration, the bot will use the value defined by the signal or the group configuration.

# Entries Ratios
## Built-in
-
### Evenly Divided
Evenly allocates the trade amount among multiple entry targets, ensuring an equal distribution of funds. For example - on a trade with 4 targets, each order will get 25% of the trade's funds.

-
### Decreasing Exponential
Starting with the highest-priced entry target, each subsequent target receives half the amount of the previous one, creating a descending distribution.
For example, in a trade with 4 entry targets, the first target gets 53.333% of the trade amount, the second target 26.666%, the third target 13.333%, and the last, with the lowest price, gets 6.666%. The total sum is always 100%.

-
### Increasing Exponential
Starting with the highest-priced entry target, each subsequent target receives twice the amount of the previous one, creating an ascending distribution.
For example, with 4 entry targets, the first target gets 6.666% of the trade amount, the second gets 13.333% (double the amount of the previous target), the third target 26.666%, and the last, with the lowest price, gets 53.333%, ensuring a total of 100%.
## Custom
In the custom strategy, you have the flexibility to personally design how the trade amount is distributed among the entry targets, tailoring the allocation to your specific preferences and trading approach.

## DCA
-
### First Entry Amount:
When enabled, you can set a specific amount to be allocated for the first entry order, defined as a percentage of the total trade amount. If disabled, the allocation for the first order will be set based on the same parameters as all other entry orders as follows.

-
### Amount Scale:
Determines the multiplier between each subsequent entry order and sets the ratio between orders based on the amount invested in each one. For example, for an amount scale of 2, if the total trade amount is $70 and the number of orders is 3, then the orders amounts will be $10, $20, and $40 respectively.
# Entries Prices
The 'Price Difference' and 'Price Scale' parameters play a crucial role in determining the orders' prices:
-
## Price Difference
This parameter sets the variance between the first and the second entry orders. The second entry order's price is set to be the first entry price minus the percentage specified as the price difference.
For example, if the first entry price is 100 and the price difference is 1%, the three initial entry orders will be placed at 100, 99 (100 - 100*1%), and 98.01 (99 - 99*1%).
-
## Price Scale
This parameter sets the price difference multiplier from the second entry order onward. It influences subsequent orders' prices.
For example, if the first entry price is 100, the price difference is 1%, and the price scale is 2, the three initial entry orders will be placed at 100, 99 (100 - 100*1%), and 97.02 (99 - 99*1%*2).
-
## Max Orders Price Difference
The maximum distance between the first order and the last order based on your settings.

# Max Number of Orders
Determines the maximum number of potential entry orders the bot will place in each trade (up to 10 entry orders).

# Trailing
The advanced trailing configuration allows you to set a conditional order that moves and follows the market price after the trigger price is reached. You can either leave it off, at the channel's discretion, or set your own trailing percentage.

If enabled, when an entry order reaches the order price, instead of executing the order as a regular limit order, the bot will create a trailing order that will trail above the minimum price that is reached by the specified percentage. Once the coin’s price rises back to the trailing price, the order will be executed and the coins will be purchased.

In some cases, the next entry target price can be reached while a trailing order is already active. When this happens, instead of creating a new trailing order, the bot will merge the amount of the new target with the existing trailing entry order that is already active. Learn more about trailing.

*In the case of Futures trades with leverage, the trailing percentage parameters will be adjusted (divided) by the trade’s leverage multiplier to keep the same effective percentage. The adjustment has a minimum threshold of 0.2%.
​Learn more about Automated Configuration Leverage Adjustment.

# First Entry as Market
The 'First Entry as Market' feature can help you avoid missing trades in automated trading, by allowing you to extend the first entry price range by a defined percentage. This becomes particularly useful in cases where the symbol price fluctuates around the entry range, and various factors such as sudden market activity or low liquidity might cause your entry order to be missed.

The 'First Entry as Market' can be activated when the signal entry price is reached, or immediately when the trade is opened. Cornix iteratively adjusts the first entry target price within the specified percentage, until the order is filled or the maximum price is reached. This extension of the potential entry price range increases the likelihood of capturing signals that have reached at least one entry target, minimizing the chances of missed trading opportunities. Learn more about First Entry as Market.
Did this answer your question?😞😐😃Cornix Help Center-
-
-
-
Intercom
We run on Intercom
window.intercomSettings = {"app_id":"wrsw0nb0","article_id":"8976601","anonymous_id":"1bdcb477-181b-4403-83d8-b29ccce51e25"};
(function(){var w=window;var ic=w.Intercom;if(typeof ic==="function"){ic('reattach_activator');ic('update',w.intercomSettings);}else{var d=document;var i=function(){i.c(arguments);};i.q=[];i.c=function(args){i.q.push(args);};w.Intercom=i;var l=function(){var s=d.createElement('script');s.type='text/javascript';s.async=true;s.src='https://widget.intercom.io/widget/wrsw0nb0';var x=d.getElementsByTagName('script')[0];x.parentNode.insertBefore(s, x);};if(document.readyState==='complete'){l();}else if(w.attachEvent){w.attachEvent('onload',l);}else{w.addEventListener('load',l,false);}}})();
\n\n---\n\n## Изображения\n\n### Изображение 1\n\n![Image 1](https://downloads.intercomcdn.com/i/o/wrsw0nb0/1883924889/93b86ca9448c579a4ec1b78fed66/image.png?expires=1772540100&amp;signature=7963f8ec16473ae84c15aa3f418d64164c9a31da19ee7e4852dde7d25605bbbe&amp;req=dSgvFcB8mYlXUPMW1HO4zZvT7Ygeup8RnSsiCrDz%2BRROEB1KHLQ2ZDieHzwF%0AvZ4AUs1K8Xv%2BMEzNFMw%3D%0A)\n\n**URL:** https://downloads.intercomcdn.com/i/o/wrsw0nb0/1883924889/93b86ca9448c579a4ec1b78fed66/image.png?expires=1772540100&amp;signature=7963f8ec16473ae84c15aa3f418d64164c9a31da19ee7e4852dde7d25605bbbe&amp;req=dSgvFcB8mYlXUPMW1HO4zZvT7Ygeup8RnSsiCrDz%2BRROEB1KHLQ2ZDieHzwF%0AvZ4AUs1K8Xv%2BMEzNFMw%3D%0A\n\n**Описание:** The screenshot shows a Cornix trading bot interface focused on the "Entries" tab, with a top navigation bar containing tabs like "General," "Entries," "Take-Profits," "Stop," and "Advanced." Below, there are "Entries Ratios" with "Channel" and "Personal" buttons, and a "Built-in," "Custom," "DCA" toggle. A search bar labeled "Evenly Divided" has a dropdown menu listing entry strategies (e.g., "One Target," "Two Targets," "Decreasing Exponential").\n\n---\n\n### Изображение 2\n\n![Image 2](https://downloads.intercomcdn.com/i/o/wrsw0nb0/1883934656/1f0ea615545496fd5b83459b2fef/image.png?expires=1772540100&amp;signature=c60a618e913c9fbe0407595a4d06137b10dca528bebf8087f808e69148fefd79&amp;req=dSgvFcB9mYdaX%2FMW1HO4zScuC1yCQSg%2BN1EyfpCGH%2BV7OQzLqrx9fL35zVKg%0Ap6Q2o46Wcaw0Mdykrzw%3D%0A)\n\n**URL:** https://downloads.intercomcdn.com/i/o/wrsw0nb0/1883934656/1f0ea615545496fd5b83459b2fef/image.png?expires=1772540100&amp;signature=c60a618e913c9fbe0407595a4d06137b10dca528bebf8087f808e69148fefd79&amp;req=dSgvFcB9mYdaX%2FMW1HO4zScuC1yCQSg%2BN1EyfpCGH%2BV7OQzLqrx9fL35zVKg%0Ap6Q2o46Wcaw0Mdykrzw%3D%0A\n\n**Описание:** The screenshot shows a Cornix trading bot interface with a "Personal" channel tab active, featuring toggle buttons for "Built-in," "Custom," and "DCA" (with "DCA" selected). UI elements include a toggle for "First Entry Amount," a text field for "First Entry Order Amount Percent" (set to 20%), a slider labeled "Amount Scale" (value 1), and a checkbox for "Only use if not defined by group."\n\n---\n\n### Изображение 3\n\n![Image 3](https://downloads.intercomcdn.com/i/o/wrsw0nb0/1883939693/8bd344533fdae87c22d41018774e/image.png?expires=1772540100&amp;signature=e13a6f3d6836f081d5b2a760e9bd10d6e7a0ed08627ca7fb47da0e57b4dc03a5&amp;req=dSgvFcB9lIdWWvMW1HO4zZJonHIfk6%2BHiCYvoDUene86O7xWC77X8ttBz9Mi%0Am4NN2yJkSZs0I3zoSA0%3D%0A)\n\n**URL:** https://downloads.intercomcdn.com/i/o/wrsw0nb0/1883939693/8bd344533fdae87c22d41018774e/image.png?expires=1772540100&amp;signature=e13a6f3d6836f081d5b2a760e9bd10d6e7a0ed08627ca7fb47da0e57b4dc03a5&amp;req=dSgvFcB9lIdWWvMW1HO4zZJonHIfk6%2BHiCYvoDUene86O7xWC77X8ttBz9Mi%0Am4NN2yJkSZs0I3zoSA0%3D%0A\n\n**Описание:** The screenshot shows a Cornix trading bot interface with UI elements including a "Entries Prices" header, a toggle between "Channel" and "Personal" tabs (with "Personal" selected), two labeled sliders: "Price Difference" (set to 1%) and "Price Scale" (set to 2), and a note stating "Max orders price difference: 14.31%".\n\n---\n\n### Изображение 4\n\n![Image 4](https://downloads.intercomcdn.com/i/o/wrsw0nb0/1883990897/f2f95ad4a2b21032041ef66636ac/image.png?expires=1772540100&amp;signature=9732b9fcd020a037b4e511a1712faa178dde9b17034777361d0958db521f0ca6&amp;req=dSgvFcB3nYlWXvMW1HO4zYymO49IaAU3mIp640WCxFgujU2Lss7Xo9TbTiOx%0A9Yt4SsO9f9%2BIBQMT34s%3D%0A)\n\n**URL:** https://downloads.intercomcdn.com/i/o/wrsw0nb0/1883990897/f2f95ad4a2b21032041ef66636ac/image.png?expires=1772540100&amp;signature=9732b9fcd020a037b4e511a1712faa178dde9b17034777361d0958db521f0ca6&amp;req=dSgvFcB3nYlWXvMW1HO4zYymO49IaAU3mIp640WCxFgujU2Lss7Xo9TbTiOx%0A9Yt4SsO9f9%2BIBQMT34s%3D%0A\n\n**Описание:** The screenshot shows a Cornix trading bot UI section with a "Trailing" toggle (currently off) and three mode buttons: "Off," "Channel," and "Personal" (the latter highlighted in blue). Below, a dropdown menu displays "10%" with a downward arrow, and a checkbox labeled "Only use if not defined by group" (unselected) includes an info icon.\n\n---\n\n### Изображение 5\n\n![Image 5](https://downloads.intercomcdn.com/i/o/wrsw0nb0/1883991243/8cb5ca559264e23bfb19b3120885/image.png?expires=1772540100&amp;signature=73305cc2e04759b72ecc67fa0130397a9ce68e7211af69c7ce68a0584832468c&amp;req=dSgvFcB3nINbWvMW1HO4zcQYIQND2lRct7DLPNl5dbkijcqfRciXRCIzLntJ%0Af%2FXAFSSfO7Wg63kWe3A%3D%0A)\n\n**URL:** https://downloads.intercomcdn.com/i/o/wrsw0nb0/1883991243/8cb5ca559264e23bfb19b3120885/image.png?expires=1772540100&amp;signature=73305cc2e04759b72ecc67fa0130397a9ce68e7211af69c7ce68a0584832468c&amp;req=dSgvFcB3nINbWvMW1HO4zcQYIQND2lRct7DLPNl5dbkijcqfRciXRCIzLntJ%0Af%2FXAFSSfO7Wg63kWe3A%3D%0A\n\n**Описание:** The screenshot shows a Cornix trading bot UI section with a "Max Number of Orders" label (accompanied by an info icon), a slider control, and a text input field displaying "5". To the right, there are "Channel" and "Personal" toggle buttons, with "Personal" highlighted in blue, indicating the active selection.\n\n---\n\n### Изображение 6\n\n![Image 6](https://downloads.intercomcdn.com/i/o/wrsw0nb0/1883992214/42dcbd170e0ec0c50ec3c109c893/image.png?expires=1772540100&amp;signature=0c56df2496cb003eb1a541d96ed9ce5f3acaa95b622d9bc0212a1eed6e2ff5cc&amp;req=dSgvFcB3n4NeXfMW1HO4zapZdJ%2BSQWyVRFDmw5J3AiXt5FsYXCq8XsKi2zfg%0ApelREesYG4sQXYhu3qo%3D%0A)\n\n**URL:** https://downloads.intercomcdn.com/i/o/wrsw0nb0/1883992214/42dcbd170e0ec0c50ec3c109c893/image.png?expires=1772540100&amp;signature=0c56df2496cb003eb1a541d96ed9ce5f3acaa95b622d9bc0212a1eed6e2ff5cc&amp;req=dSgvFcB3n4NeXfMW1HO4zapZdJ%2BSQWyVRFDmw5J3AiXt5FsYXCq8XsKi2zfg%0ApelREesYG4sQXYhu3qo%3D%0A\n\n**Описание:** The screenshot shows a Cornix trading bot interface with UI elements for trade settings: a toggle labeled "First Entry as Market" (set to "Personal"), a dropdown for "Maximum Price Cap (%)" (set to 5%), and a "When to Activate" section with two radio buttons—"Entry Price Reached" (selected) and "Immediately." The design uses a clean, minimalistic layout with blue accents for active selections.\n\n---\n\n### Изображение 7\n\n![Image 7](https://downloads.intercomcdn.com/i/o/wrsw0nb0/663085/66f657d34c477c0cb5e0ad55a357/811b89d422741a7d1e34bcfcff4f39f0.png)\n\n**URL:** https://downloads.intercomcdn.com/i/o/wrsw0nb0/663085/66f657d34c477c0cb5e0ad55a357/811b89d422741a7d1e34bcfcff4f39f0.png\n\n**Описание:** The screenshot displays the Cornix trading bot’s logo, featuring a stylized dark blue crow holding a yellow object (likely a coin) above the brand name “cornix” in bold, dark blue lowercase letters. The design is clean and minimalistic, with the crow positioned centrally above the text, emphasizing the brand identity.\n\n---\n\n### Изображение 8\n\n![Image 8](https://static.intercomassets.com/avatars/5322994/square_128/IMG-20230206-WA0000_%281%29-1678375300.jpeg)\n\n**URL:** https://static.intercomassets.com/avatars/5322994/square_128/IMG-20230206-WA0000_%281%29-1678375300.jpeg\n\n**Описание:** The screenshot shows a Cornix trading bot interface with a clean, minimalistic design. The UI features a dark-themed layout, likely displaying trading parameters, bot status indicators, and control buttons for managing automated trading strategies. Key elements include sections for strategy configuration, performance metrics, and action buttons (e.g., start/stop) to execute or adjust the bot’s operations.\n\n---\n\n
