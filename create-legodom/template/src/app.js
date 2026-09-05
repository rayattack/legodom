import { Lego } from 'lego-dom';
import 'virtual:lego-blocks'; // 1. Register SFCs
import './style.css';

// Surface template typos as errors in dev instead of silent blanks.
Lego.config.strict = import.meta.env.DEV;

// 2. Start the Engine
Lego.init();
