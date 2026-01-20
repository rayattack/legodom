import { Lego } from 'lego-dom';
import registerBlocks from 'virtual:lego-blocks';
import './style.css';

// 1. Register SFCs
registerBlocks();

// 2. Start the Engine
Lego.init();
