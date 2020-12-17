const { expect } = require('chai');

const { BN, balance, send, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

const Etheroes = artifacts.require('Etheroes');

const e17 = new BN('10').pow(new BN('17'));
const e17e = new BN('10').pow(new BN('17')).mul(new BN(0.95));
const e18 = new BN('10').pow(new BN('18'));

contract('Etheroes', function([owner, other]) {
    beforeEach(async function() {
        this.etheroes = await Etheroes.new({ from: owner });
        await this.etheroes.initialize({ from: owner });
    });

    it('mint tokens', async function() {
        const numTokens = 100;

        const receipt = await this.etheroes.adminMint(numTokens, { from: owner });
        expect(await this.etheroes.totalNumOfTokens()).to.be.bignumber.equal(new BN(numTokens));

        let dnas = new Set();

        for (let i = 1; i <= numTokens; ++i) {
            expect(await this.etheroes.tokenClaimable(i)).to.be.equal(true);
            const dna = await this.etheroes.tokenDNA(i);
            expect(dnas.has(dna)).to.be.equal(false);
            dnas.add(dna);

            expectEvent(receipt, 'Minted', { tokenId: i.toString(), dna: dna });
        }
    });

    it("non owner can't mint token", async function() {
        await expectRevert(this.etheroes.adminMint(1, { from: other }), 'Ownable: caller is not the owner');
    });

    it("can't mint too much", async function() {
        await expectRevert(this.etheroes.adminMint(10001, { from: owner }), 'Maximum supply reached');
    });

    it('claim tokens', async function() {
        const numTokens = 10;

        await this.etheroes.adminMint(numTokens, { from: owner });

        for (let i = 1; i <= numTokens; ++i) {
            const cost = await this.etheroes.getClaimCost();
            const receipt = await this.etheroes.claimToken(i, { from: other, value: cost });
            expectEvent(receipt, 'Claimed', { tokenId: i.toString(), newOwner: other });
            expect(await this.etheroes.tokenClaimable(i)).to.be.equal(false);
            expect(await this.etheroes.ownerOf(i)).to.be.equal(other);
        }
    });

    it('not enough fund to claim token', async function() {
        const numTokens = 1;

        await this.etheroes.adminMint(numTokens, { from: owner });

        const cost = await this.etheroes.getClaimCost();
        await expectRevert(this.etheroes.claimToken(1, { from: other, value: cost / 2 }), 'Not enough fund');
        expect(await this.etheroes.tokenClaimable(1)).to.be.equal(true);
    });

    it('claim an already claimed token', async function() {
        const numTokens = 1;

        await this.etheroes.adminMint(numTokens, { from: owner });

        const cost = await this.etheroes.getClaimCost();
        await this.etheroes.claimToken(1, { from: other, value: cost });
        await expectRevert(this.etheroes.claimToken(1, { from: other, value: cost }), 'Already claimed');
        expect(await this.etheroes.tokenClaimable(1)).to.be.equal(false);
    });

    it('claim an invalid token', async function() {
        const numTokens = 1;

        await this.etheroes.adminMint(numTokens, { from: owner });

        const cost = await this.etheroes.getClaimCost();
        await expectRevert(this.etheroes.claimToken(2, { from: other, value: cost }), 'Invalid token ID');
    });

    it('change claim cost', async function() {
        const numTokens = 1;

        await this.etheroes.adminMint(numTokens, { from: owner });

        const originalCost = await this.etheroes.getClaimCost();
        await this.etheroes.adminSetClaimCost(e18, { from: owner });
        await expectRevert(this.etheroes.claimToken(1, { from: other, value: originalCost }), 'Not enough fund');

        const newCost = await this.etheroes.getClaimCost();
        await this.etheroes.claimToken(1, { from: other, value: newCost });
        expect(await this.etheroes.tokenClaimable(1)).to.be.equal(false);

        await expectRevert(this.etheroes.adminSetClaimCost(e17, { from: other }), 'Ownable: caller is not the owner');
    });

    it('zero claim cost', async function() {
        const numTokens = 2;

        await this.etheroes.adminMint(numTokens, { from: owner });

        const originalCost = await this.etheroes.getClaimCost();
        await this.etheroes.adminSetClaimCost(0, { from: owner });

        const newCost = await this.etheroes.getClaimCost();
        await this.etheroes.claimToken(1, { from: other, value: newCost });
        expect(await this.etheroes.tokenClaimable(1)).to.be.equal(false);

        await this.etheroes.adminSetClaimCost(e17, { from: owner });
        await expectRevert(this.etheroes.claimToken(2, { from: other, value: newCost }), 'Not enough fund');
        expect(await this.etheroes.tokenClaimable(2)).to.be.equal(true);
    });

    it('spending and refund', async function() {
        expect(await balance.current(this.etheroes.address)).to.be.bignumber.equal(new BN(0));

        await this.etheroes.adminMint(1, { from: owner });

        const balBefore = await balance.current(other);
        await this.etheroes.claimToken(1, { from: other, value: 2e17 });
        const balAfter = await balance.current(other);

        expect(await balance.current(this.etheroes.address)).to.be.bignumber.equal(e17);

        expect(balBefore.sub(balAfter)).to.be.bignumber.greaterThan(e17);
        expect(balBefore.sub(balAfter)).to.be.bignumber.lessThan(e17.mul(new BN(2)));
    });

    it('withdraw', async function() {
        await this.etheroes.adminMint(1, { from: owner });
        await this.etheroes.claimToken(1, { from: other, value: 2e17 });

        await expectRevert(this.etheroes.adminWithdraw({ from: other }), 'Ownable: caller is not the owner');

        const bal = await balance.current(owner);
        await this.etheroes.adminWithdraw({ from: owner });
        expect(await balance.current(owner)).to.be.bignumber.greaterThan(bal);
    });

    it('put up for sale', async function() {
        await this.etheroes.adminMint(1, { from: owner });
        await this.etheroes.claimToken(1, { from: other, value: 2e17 });

        const receipt = await this.etheroes.forSaleToken(1, e17, { from: other });
        expectEvent(receipt, 'ForSale', { tokenId: new BN(1), owner: other, price: e17 });
        const tokensForSale = await this.etheroes.listTokensForSale();
        expect(tokensForSale.length).to.be.equal(1);
        expect(tokensForSale[0]).to.be.bignumber.equal(new BN(1));
        expect(await this.etheroes.salePrice(new BN(1))).to.be.bignumber.equal(e17);

        await expectRevert(this.etheroes.salePrice(new BN(2)), 'Token is not for sale');
    });

    it('non-owner cannot sale', async function() {
        await this.etheroes.adminMint(1, { from: owner });
        await this.etheroes.claimToken(1, { from: other, value: 2e17 });

        await expectRevert(this.etheroes.forSaleToken(1, e17, { from: owner }), 'You are not the owner');
    });

    it('sale price must be valid', async function() {
        await this.etheroes.adminMint(1, { from: owner });
        await this.etheroes.claimToken(1, { from: other, value: 2e17 });

        await expectRevert(this.etheroes.forSaleToken(1, 0, { from: other }), 'Sale price must be greater than zero');
    });

    it('cancel sale', async function() {
        await this.etheroes.adminMint(1, { from: owner });
        await this.etheroes.claimToken(1, { from: other, value: 2e17 });

        await this.etheroes.forSaleToken(1, e17, { from: other });
        await expectRevert(this.etheroes.cancelSaleToken(1, { from: owner }), 'You are not the owner');
        const receipt = await this.etheroes.cancelSaleToken(1, { from: other });
        expectEvent(receipt, 'CancelForSale', { tokenId: new BN(1), owner: other });
        const tokensForSale = await this.etheroes.listTokensForSale();
        expect(tokensForSale.length).to.be.equal(0);
        await expectRevert(this.etheroes.salePrice(new BN(1)), 'Token is not for sale');
        await expectRevert(this.etheroes.cancelSaleToken(1, { from: other }), 'Token is not for sale');
    });

    it('buy token', async function() {
        await this.etheroes.adminMint(2, { from: owner });
        await this.etheroes.claimToken(1, { from: other, value: 2e17 });
        await this.etheroes.claimToken(2, { from: other, value: 2e17 });

        await this.etheroes.forSaleToken(1, e17, { from: other });

        await expectRevert(this.etheroes.buyToken(1, { from: other }), 'You already own the token');
        await expectRevert(this.etheroes.buyToken(2, { from: owner }), 'Token is not for sale');
        await expectRevert(this.etheroes.buyToken(1, { from: owner }), 'Not enough funds');

        const balBeforeOther = await balance.current(other);
        const balBeforeOwner = await balance.current(owner);

        const receipt = await this.etheroes.buyToken(1, { from: owner, value: 2e17 });
        expectEvent(receipt, 'Sale', { from: other, to: owner, tokenId: new BN(1), price: e17 });
        expect(await this.etheroes.ownerOf(1)).to.be.equal(owner);

        const balAfterOther = await balance.current(other);
        const balAfterOwner = await balance.current(owner);

        expect(balAfterOther.sub(balBeforeOther)).to.be.bignumber.greaterThan(e17e);
        expect(balBeforeOwner.sub(balAfterOwner)).to.be.bignumber.greaterThan(e17e);
    });

    it('get token level', async function() {
        const receipt = await this.etheroes.adminMint(1, { from: owner });

        expect(await this.etheroes.getTokenLevel(new BN(1))).to.be.bignumber.equal(new BN(1));
        await expectRevert(this.etheroes.getTokenLevel(new BN(2)), 'Invalid token ID');
        expect(await this.etheroes.getTokenNextAvailableLevelUp(new BN(1))).to.be.bignumber.equal(
            new BN(receipt.receipt.blockNumber + 300)
        );
    });
});
