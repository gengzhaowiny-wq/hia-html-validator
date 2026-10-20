"use strict";

// Self-contained synthetic input; no private lesson content or remote assets.
module.exports = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Lesson traversal fixture</title>
<style>
*{box-sizing:border-box}body{margin:0;font:20px Arial}
.slide{display:none;width:960px;height:480px;padding:24px}
.slide.active{display:block}.hdr{font-size:26px}.body{padding-top:20px}
.nav{height:60px;padding:12px}button{font:inherit}
</style></head><body>
<section class="slide active" id="s1"><header class="hdr">First fixture page</header>
<div class="body"><p>Initial content.</p><p data-step="1" hidden>A revealed explanation.</p></div></section>
<section class="slide" id="s2"><header class="hdr">Second fixture page</header>
<div class="body"><p>A distinct final page.</p></div></section>
<nav class="nav"><button id="next">Next</button> <span id="counter">1 / 2</span> <span id="step">Step 0 / 1</span></nav>
<script>
const slides=[...document.querySelectorAll('.slide')];let current=0,step=0;
document.querySelector('#next').addEventListener('click',()=>{
 if(current===0&&step===0){step=1;document.querySelector('[data-step]').hidden=false;}
 else if(current===0){slides[0].classList.remove('active');slides[1].classList.add('active');current=1;step=0;}
 document.querySelector('#counter').textContent=(current+1)+' / 2';
 document.querySelector('#step').textContent='Step '+step+' / '+(current===0?1:0);
});
</script></body></html>`;
