# Signals Bot Advanced Settings - Stop Loss Strategy

**URL:** https://help.cornix.io/en/articles/8976608-signals-bot-advanced-settings-stop-loss-strategy

**Created:** 2026-03-03T11:47:21+00:00

---

Signals Bot Advanced Settings - Stop Loss Strategy | Cornix Help Center- - - - - - :root{--body-bg: rgb(255, 255, 255);
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
Channel vs. Personal'Channel''Personal''Only use if not defined by group'StopStop-Loss Distance PercentStop-Loss Baseline⚠️ Important Note Skip Signals Without Stop-LossStop-Loss TimeoutTrailingStop Loss Automatic Leverage Adjustments - All Collections
- Trading Bots
- Signals
- Signals Bots Advanced Settings
- Signals Bot Advanced Settings - Stop Loss Strategy
# Signals Bot Advanced Settings - Stop Loss Strategy
How to set your own Stop-Loss strategy to override the signals channel settings
Written by Hadar Cornix Updated over 3 months agoTable of contents
Channel vs. Personal'Channel''Personal''Only use if not defined by group'StopStop-Loss Distance PercentStop-Loss Baseline⚠️ Important Note Skip Signals Without Stop-LossStop-Loss TimeoutTrailingStop Loss Automatic Leverage Adjustments
# Channel vs. Personal
## 'Channel'
While the 'Channel' toggle is enabled, the Stop configuration for each trade will be determined dynamically based on the signal and channel settings.

## 'Personal'
Use the 'Personal' option to override the channel and determine your own Stop-Loss preferences.

## 'Only use if not defined by group'
Selecting the "Only use if not defined by group" checkbox will enable the chosen stop-loss configurations to be used as a fallback only when the parameter is not specified in the group configuration or the posted signal. If the parameter is defined in the group configuration or signal, the bot will use the value set in the group configuration.

# Stop

## Stop-Loss Distance Percent
The percentage away from the selected stop baseline at which the trade will place a sell order at a loss.

## Stop-Loss Baseline
Defines which price the stop-loss distance will be calculated from.
-
### First Entry
If you use this as your baseline the stop-loss will be placed at the set distance away from the first entry price.
*First entry based on the signal's entries + the user's entry strategy.
-
### Average Entries
If you use this as your baseline the stop-loss will be placed at the set distance away from the calculated average of your entry orders.
*Based on the signal's entries + the user's entry strategy.

## ⚠️ Important Note
By Choosing 'Off' you will completely disable stop loss orders in your trades. This means no stop loss order will be created for your automated trades.

# Skip Signals Without Stop-Loss
This parameter is only applicable when the Channel value is selected for the default stop. When Off/Personal values are selected, your trades will either never have a stop or always have a stop, and this parameter will have no effect.

# Stop-Loss Timeout
The Stop Loss Timeout feature allows you to define a timeout period by which to delay the closing of a trade by a stop-loss order, in case you suspect the price will change again in the desired direction shortly, and you don't want to close (sell) your position immediately when reaching the stop-loss price.
You can set a timeout of 1 Minute up to 1 Day (24 hours).
Read more about Stop Loss Timeout.

# Trailing
The Trailing Stop-loss feature aims to help you protect and secure profits from trades managed by the Cornix trading bot. It's a valuable tool that, when used correctly, can enhance your trading strategy. It's essential to familiarize yourself with the five different trailing stop types our bot offers.
By understanding and selecting the trailing stop type that aligns with your trading goals, you can dynamically secure profits while minimizing risk.
-
## Breakeven:
Moves the stop-loss to the average entry point automatically.

-
## Moving Target:
Gradually shifts the stop-loss to a distance of one target from the last target that was reached.

-
## Moving 2-Target:
Shifts the stop-loss to a distance of two target from the last target that was reached.

-
## Percent Below Triggers:
Sets the stop-loss at a percentage distance below a specific price reached.

-
## Percent Below Highest:
Shifts the stop-loss to a percentage below the trigger, and keeps trailing that same distance below the maximum price that is reached during the trade.
Each stop type requires a trigger. The trailing stop will only activate once the trigger conditions are met. Specific trigger conditions are outlined for each stop type.
Read all about Trailing Stop Loss.

# Stop Loss Automatic Leverage Adjustments
Please note that for automated trades with leverage, the bot will automatically divide "Stop-Loss Distance Percent" and "Trailing Stop-Loss" percentage parameters (excluding triggers) by the trade's leverage to keep your effective percentage settings.
Learn more about Automated Configuration Leverage Adjustment.
Did this answer your question?😞😐😃Cornix Help Center-
-
-
-
Intercom
We run on Intercom
window.intercomSettings = {"app_id":"wrsw0nb0","article_id":"8976608","anonymous_id":"72bd0dea-636d-4219-9b37-4a8892e02f1d"};
(function(){var w=window;var ic=w.Intercom;if(typeof ic==="function"){ic('reattach_activator');ic('update',w.intercomSettings);}else{var d=document;var i=function(){i.c(arguments);};i.q=[];i.c=function(args){i.q.push(args);};w.Intercom=i;var l=function(){var s=d.createElement('script');s.type='text/javascript';s.async=true;s.src='https://widget.intercom.io/widget/wrsw0nb0';var x=d.getElementsByTagName('script')[0];x.parentNode.insertBefore(s, x);};if(document.readyState==='complete'){l();}else if(w.attachEvent){w.attachEvent('onload',l);}else{w.addEventListener('load',l,false);}}})();

@keyframes intercom-lightweight-app-launcher {
from {
opacity: 0;
transform: scale(0.5);
}
to {
opacity: 1;
transform: scale(1);
}
}
@keyframes intercom-lightweight-app-gradient {
from {
opacity: 0;
}
to {
opacity: 1;
}
}
@keyframes intercom-lightweight-app-messenger {
0% {
opacity: 0;
transform: scale(0);
}
40% {
opacity: 1;
}
100% {
transform: scale(1);
}
}
.intercom-lightweight-app {
position: fixed;
z-index: 2147483001;
width: 0;
height: 0;
font-family: system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
}
.intercom-lightweight-app-gradient {
position: fixed;
z-index: 2147483002;
width: 500px;
height: 500px;
bottom: 0;
right: 0;
pointer-events: none;
background: radial-gradient(
ellipse at bottom right,
rgba(29, 39, 54, 0.16) 0%,
rgba(29, 39, 54, 0) 72%);
animation: intercom-lightweight-app-gradient 200ms ease-out;
}
.intercom-lightweight-app-launcher {
position: fixed;
z-index: 2147483003;
padding: 0 !important;
margin: 0 !important;
border: none;
bottom: 20px;
right: 20px;
max-width: 48px;
width: 48px;
max-height: 48px;
height: 48px;
border-radius: 50%;
background: #0071b2;
cursor: pointer;
box-shadow: 0 1px 6px 0 rgba(0, 0, 0, 0.06), 0 2px 32px 0 rgba(0, 0, 0, 0.16);
transition: transform 167ms cubic-bezier(0.33, 0.00, 0.00, 1.00);
box-sizing: content-box;
}
.intercom-lightweight-app-launcher:hover {
transition: transform 250ms cubic-bezier(0.33, 0.00, 0.00, 1.00);
transform: scale(1.1)
}
.intercom-lightweight-app-launcher:active {
transform: scale(0.85);
transition: transform 134ms cubic-bezier(0.45, 0, 0.2, 1);
}
.intercom-lightweight-app-launcher:focus {
outline: none;

}
.intercom-lightweight-app-launcher-icon {
display: flex;
align-items: center;
justify-content: center;
position: absolute;
top: 0;
left: 0;
width: 48px;
height: 48px;
transition: transform 100ms linear, opacity 80ms linear;
}
.intercom-lightweight-app-launcher-icon-open {

opacity: 1;
transform: rotate(0deg) scale(1);

}
.intercom-lightweight-app-launcher-icon-open svg {
width: 24px;
height: 24px;
}
.intercom-lightweight-app-launcher-icon-open svg path {
fill: rgb(255, 255, 255);
}
.intercom-lightweight-app-launcher-icon-self-serve {

opacity: 1;
transform: rotate(0deg) scale(1);

}
.intercom-lightweight-app-launcher-icon-self-serve svg {
height: 44px;
}
.intercom-lightweight-app-launcher-icon-self-serve svg path {
fill: rgb(255, 255, 255);
}
.intercom-lightweight-app-launcher-custom-icon-open {
max-height: 24px;
max-width: 24px;

opacity: 1;
transform: rotate(0deg) scale(1);

}
.intercom-lightweight-app-launcher-icon-minimize {

opacity: 0;
transform: rotate(-60deg) scale(0);

}
.intercom-lightweight-app-launcher-icon-minimize svg path {
fill: rgb(255, 255, 255);
}
/* Extended launcher styles */
.intercom-lightweight-app-launcher.intercom-launcher-extended {
width: calc(180px - 30px);
max-width: calc(180px - 30px);
height: calc(45px - 26px);
max-height: calc(45px - 26px);
border-radius: 12px;
display: flex;
align-items: center;
justify-content: flex-start;
padding: 12px 16px 12px 12px !important;
gap: 6px;
/* Use theme background instead of hardcoded gradient */
background: #0071b2;
border: 1px solid rgba(255, 255, 255, 0.15);
box-shadow: 0px -2px 50px rgba(0, 0, 0, 0.1);

}
.intercom-lightweight-app-launcher.intercom-launcher-extended .intercom-lightweight-app-launcher-icon {
position: relative;
width: 24px;
height: 24px;
}
.intercom-lightweight-app-launcher-text {
/* Match text color with launcher icon */
color: rgb(255, 255, 255);
font-size: 14px;
font-weight: 600;
line-height: 1.5;
white-space: nowrap;
overflow: hidden;
text-overflow: ellipsis;
max-width: 140px;
opacity: 1;
transition: opacity 80ms linear;
}
.intercom-lightweight-app-messenger {
position: fixed;
z-index: 2147483003;
overflow: hidden;
background-color: #ffffff;
animation: intercom-lightweight-app-messenger 250ms cubic-bezier(0, 1, 1, 1);
transform-origin: bottom right;

width: 400px;
height: calc(100% - 104px);
max-height: 704px;
min-height: 250px;
right: 20px;
bottom: 84px;
box-shadow: 0 5px 40px rgba(0,0,0,0.16);

border-radius: 24px;
}
.intercom-lightweight-app-messenger-header {
height: 64px;
border-bottom: none;
background: #ffffff;
}
.intercom-lightweight-app-messenger-footer{
position:absolute;
bottom:0;
width: 100%;
height: 80px;
background: #ffffff;
font-size: 14px;
line-height: 21px;
border-top: 1px solid rgba(0, 0, 0, 0.05);
box-shadow: 0px 0px 25px rgba(0, 0, 0, 0.05);
}
@media print {
.intercom-lightweight-app {
display: none;
}
}
\n\n---\n\n## Изображения\n\n### Изображение 1\n\n![Image 1](https://downloads.intercomcdn.com/i/o/wrsw0nb0/1885621350/e7d70ed0de08fb899c31dee2fa0e/image.png?expires=1772540100&amp;signature=d7949b0ec20743574762e59ca3d93d442807f881f5f050436a0c702c900209c1&amp;req=dSgvE898nIJaWfMW1HO4zR9Km4Ve3H%2BjRG%2BLg3rgz%2FsgDaUqtP2eXR8oC8GA%0AwH8dHbmI1VGIZ5pBWKo%3D%0A)\n\n**URL:** https://downloads.intercomcdn.com/i/o/wrsw0nb0/1885621350/e7d70ed0de08fb899c31dee2fa0e/image.png?expires=1772540100&amp;signature=d7949b0ec20743574762e59ca3d93d442807f881f5f050436a0c702c900209c1&amp;req=dSgvE898nIJaWfMW1HO4zR9Km4Ve3H%2BjRG%2BLg3rgz%2FsgDaUqtP2eXR8oC8GA%0AwH8dHbmI1VGIZ5pBWKo%3D%0A\n\n**Описание:** The screenshot shows the "Stop" tab of the Cornix trading bot interface, with a top navigation bar containing tabs like "General," "Entries," "Take-Profits," "Stop" (selected), and "Advanced." Below, there are toggle options for "Stop" (Off/Channel/Personal, with "Personal" selected), input fields for "Stop-Loss Distance Percent" (set to 5%) and a dropdown for "Stop-Loss Baseline" (set to "Average Entries"), plus a checkbox for "Only use if not defined by group."\n\n---\n\n### Изображение 2\n\n![Image 2](https://downloads.intercomcdn.com/i/o/wrsw0nb0/1885625762/b7eba1266bae758e97e3bdd912d5/image.png?expires=1772540100&amp;signature=5e11cd5431c272249e6df95ac1e71a56ebe791774d5a0475fea1ec322c12e654&amp;req=dSgvE898mIZZW%2FMW1HO4zZu6bAQtuUdMFmmIVaYtt0rqWZ3Sgfwgrg1%2FFZ6R%0ACPBzzkEv94agBwbZH9Q%3D%0A)\n\n**URL:** https://downloads.intercomcdn.com/i/o/wrsw0nb0/1885625762/b7eba1266bae758e97e3bdd912d5/image.png?expires=1772540100&amp;signature=5e11cd5431c272249e6df95ac1e71a56ebe791774d5a0475fea1ec322c12e654&amp;req=dSgvE898mIZZW%2FMW1HO4zZu6bAQtuUdMFmmIVaYtt0rqWZ3Sgfwgrg1%2FFZ6R%0ACPBzzkEv94agBwbZH9Q%3D%0A\n\n**Описание:** The screenshot shows a Cornix trading bot interface with a "Stop" section at the top, featuring toggle tabs for "Off," "Channel" (selected), and "Personal." Below, there’s a "Stop-Loss Distance Percent" field (value "5"), a "Stop-Loss Baseline" info icon, and a blue info box explaining "Channel" settings. At the bottom, a toggle labeled "Skip Signals Without Stop-Loss" is set to "On," with an arrow pointing to it.\n\n---\n\n### Изображение 3\n\n![Image 3](https://downloads.intercomcdn.com/i/o/wrsw0nb0/1885650443/957e14c159858f1fc1ea800a8fa3/image.png?expires=1772540100&amp;signature=7b90e7e3ff46df0b77c17aa3c547b2af167e2e8888033bc5af1a7b394f128cad&amp;req=dSgvE897nYVbWvMW1HO4zZJbhx2SgS70EjHfT4Vpi9QAsE901OljG7ZE%2FtvK%0AKW6gBz%2FHubF70lp1ZFM%3D%0A)\n\n**URL:** https://downloads.intercomcdn.com/i/o/wrsw0nb0/1885650443/957e14c159858f1fc1ea800a8fa3/image.png?expires=1772540100&amp;signature=7b90e7e3ff46df0b77c17aa3c547b2af167e2e8888033bc5af1a7b394f128cad&amp;req=dSgvE897nYVbWvMW1HO4zZJbhx2SgS70EjHfT4Vpi9QAsE901OljG7ZE%2FtvK%0AKW6gBz%2FHubF70lp1ZFM%3D%0A\n\n**Описание:** The screenshot shows a Cornix trading bot UI section for "Stop-Loss Timeout" settings. There’s a toggle switch (currently set to "Off") and a blue "Personal" button, with a dropdown menu below displaying "10 Minutes" as the selected timeout duration.\n\n---\n\n### Изображение 4\n\n![Image 4](https://downloads.intercomcdn.com/i/o/wrsw0nb0/1885652371/aada2083bc7b12f3796ab5c21040/image.png?expires=1772540100&amp;signature=1dfc7f947d9831bed51d29f32d3cd591950cf97b0f20178d7997da46bd061dd4&amp;req=dSgvE897n4JYWPMW1HO4zfyJik1XsyEWDP8AJZ4ovyCZTJdootsLWpE1NSN%2F%0APf2BpO14j7shRyirYsg%3D%0A)\n\n**URL:** https://downloads.intercomcdn.com/i/o/wrsw0nb0/1885652371/aada2083bc7b12f3796ab5c21040/image.png?expires=1772540100&amp;signature=1dfc7f947d9831bed51d29f32d3cd591950cf97b0f20178d7997da46bd061dd4&amp;req=dSgvE897n4JYWPMW1HO4zfyJik1XsyEWDP8AJZ4ovyCZTJdootsLWpE1NSN%2F%0APf2BpO14j7shRyirYsg%3D%0A\n\n**Описание:** The screenshot shows a Cornix trading bot interface with a "Trading" header, toggle buttons ("Off," "Channel," "Personal" with "Personal" selected), and sections for "Type" (with a "Moving Target" dropdown open, displaying options like "Moving Target," "Moving 2 Target," "Breakeven," etc.) and "Trigger" (with a checkbox labeled "Only use if not defined by group"). The UI is clean, with a dropdown menu expanded on the right side of the "Type" field.\n\n---\n\n### Изображение 5\n\n![Image 5](https://downloads.intercomcdn.com/i/o/wrsw0nb0/663085/66f657d34c477c0cb5e0ad55a357/811b89d422741a7d1e34bcfcff4f39f0.png)\n\n**URL:** https://downloads.intercomcdn.com/i/o/wrsw0nb0/663085/66f657d34c477c0cb5e0ad55a357/811b89d422741a7d1e34bcfcff4f39f0.png\n\n**Описание:** The screenshot displays the Cornix trading bot’s logo, featuring a stylized dark blue crow (raven) with a yellow beak, perched on a curved line above the lowercase text “cornix” in bold, dark blue font. The design is clean and minimalistic, with the bird and text centered on a white background, emphasizing the brand’s visual identity.\n\n---\n\n### Изображение 6\n\n![Image 6](https://static.intercomassets.com/avatars/5322994/square_128/IMG-20230206-WA0000_%281%29-1678375300.jpeg)\n\n**URL:** https://static.intercomassets.com/avatars/5322994/square_128/IMG-20230206-WA0000_%281%29-1678375300.jpeg\n\n**Описание:** The screenshot shows a Cornix trading bot interface with a clean, modern UI. Key elements include a navigation bar (likely for bot management, settings, or account access), a central dashboard area (possibly displaying trading metrics or bot status), and a sidebar (for quick access to features like strategy selection or trade history). The design emphasizes clarity and ease of use for monitoring and controlling trading activities.\n\n---\n\n
